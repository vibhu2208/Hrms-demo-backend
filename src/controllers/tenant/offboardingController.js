// Utility function to get tenant-specific models
const getTenantModel = (connection, modelName, schema) => {
  return connection.model(modelName, schema);
};
const offboardingWorkflow = require('../../services/offboardingWorkflow');
const offboardingRequestSchema = require('../../models/tenant/OffboardingRequest');
const offboardingTaskSchema = require('../../models/tenant/OffboardingTask');
const handoverDetailSchema = require('../../models/tenant/HandoverDetail');
const assetClearanceSchema = require('../../models/tenant/AssetClearance');
const finalSettlementSchema = require('../../models/tenant/FinalSettlement');
const exitFeedbackSchema = require('../../models/tenant/ExitFeedback');

/**
 * Comprehensive Offboarding Controller
 * Phase 4-11: Complete Implementation
 */

// ==================== MAIN OFFBOARDING OPERATIONS ====================

/**
 * Get all offboarding requests with filtering and pagination
 */
exports.getOffboardingRequests = async (req, res) => {
  try {
    const { status, stage, priority, page = 1, limit = 10, search } = req.query;
    const OffboardingRequest = getTenantModel(req.tenant.connection, 'OffboardingRequest', offboardingRequestSchema);
    
    // Get tenant-specific models
    const { getTenantModels } = require('../../utils/tenantModels');
    const { Employee: TenantEmployee, Department: TenantDepartment } = getTenantModels(req.tenant.connection);
    const User = require('../../models/User'); // User stays global
    
    // Build query (no need for clientId filter since we have database isolation)
    let query = {};
    if (status) query.status = status;
    if (stage) query.currentStage = stage;
    if (priority) query.priority = priority;
    if (search) {
      // For now, search by offboarding request fields only
      query.$or = [
        { reason: { $regex: search, $options: 'i' } },
        { reasonDetails: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const requests = await OffboardingRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Manually populate employee data from main database or snapshots
    for (let request of requests) {
      if (request.employeeId) {
        if (request.status === 'closed' && request.employeeSnapshot) {
          // If offboarding is closed and snapshot exists, use archived employee data
          let departmentData = null;
          if (request.employeeSnapshot.department) {
            // Try to populate department name from snapshot
            try {
              const department = await TenantDepartment.findById(request.employeeSnapshot.department).select('name');
              departmentData = department ? { name: department.name } : null;
            } catch (error) {
              departmentData = null;
            }
          }

          request.employeeId = {
            ...request.employeeSnapshot,
            department: departmentData,
            reportingManager: request.employeeSnapshot.reportingManager
          };
          
          // Auto-fix: If offboarding is closed but employee is not marked as ex-employee, process it
          // Do this asynchronously to not slow down the response
          if (request.status === 'closed' && request.isCompleted) {
            TenantEmployee.findById(request.employeeSnapshot._id || request.employeeId)
              .then(employee => {
                if (employee && !employee.isExEmployee) {
                  // Process this offboarding in background
                  offboardingWorkflow.completeOffboarding(req.tenant.connection, request)
                    .then(() => {
                    })
                    .catch(err => {
                      console.error(`Background offboarding fix failed for ${request._id}:`, err);
                    });
                }
              })
              .catch(err => {
                console.warn(`Could not check employee for auto-fix:`, err);
              });
          }
        } else {
          // Otherwise, fetch live employee data
          const employee = await TenantEmployee.findById(request.employeeId)
            .populate('department', 'name')
            .populate('reportingManager', 'firstName lastName email');
          request.employeeId = employee;
          
          // Auto-fix: If offboarding is closed but employee is not marked as ex-employee, process it
          if (request.status === 'closed' && request.isCompleted && employee && !employee.isExEmployee) {
            // Process this offboarding in background
            offboardingWorkflow.completeOffboarding(req.tenant.connection, request)
              .then(() => {
              })
              .catch(err => {
                console.error(`Background offboarding fix failed for ${request._id}:`, err);
              });
          }
        }
      }
      if (request.initiatedBy) {
        const user = await User.findById(request.initiatedBy).select('email firstName lastName');
        request.initiatedBy = user;
      }
    }

    const total = await OffboardingRequest.countDocuments(query);

    // Calculate summary statistics (similar to legacy controller)
    const allRequests = await OffboardingRequest.find({}).select('status currentStage');
    const summary = {
      total: allRequests.length,
      inProgress: allRequests.filter(r => r.status === 'checklist_active' || r.status === 'clearance_in_progress' || r.status === 'settlement_pending' || r.status === 'feedback_pending').length,
      completed: allRequests.filter(r => r.status === 'closed').length,
      cancelled: allRequests.filter(r => r.status === 'cancelled').length,
      byStage: {}
    };

    // Count by stage
    allRequests.forEach(request => {
      if (request.currentStage) {
        summary.byStage[request.currentStage] = (summary.byStage[request.currentStage] || 0) + 1;
      }
    });

    // Transform data to match frontend expectations
    const transformedRequests = requests.map(request => ({
      _id: request._id,
      employee: request.employeeId ? {
        firstName: request.employeeId.firstName,
        lastName: request.employeeId.lastName,
        email: request.employeeId.email,
        employeeCode: request.employeeId.employeeCode,
        department: request.employeeId.department && request.employeeId.department.name
          ? { name: request.employeeId.department.name }
          : request.employeeId.department || null
      } : null,
      initiatedBy: request.initiatedBy,
      lastWorkingDate: request.lastWorkingDay,
      resignationType: request.reason === 'voluntary_resignation' ? 'voluntary' : 'involuntary',
      reason: request.reason,
      stages: ['initiation', 'manager_approval', 'hr_approval', 'finance_approval', 'checklist_generation', 'departmental_clearance', 'asset_return', 'knowledge_transfer', 'final_settlement', 'exit_interview', 'closure'],
      currentStage: request.currentStage,
      status: request.status === 'closed' ? 'completed' : request.status === 'cancelled' ? 'cancelled' : 'in-progress',
      createdAt: request.createdAt,
      updatedAt: request.updatedAt
    }));

    res.status(200).json({
      success: true,
      data: transformedRequests,
      summary,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching offboarding requests:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get specific offboarding request with all related data
 */
exports.getOffboardingRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const OffboardingRequest = getTenantModel(req.tenant.connection, 'OffboardingRequest', offboardingRequestSchema);
    
    // Use main database models for Employee and User (they are not tenant-specific)
    const Employee = require('../../models/Employee');
    const User = require('../../models/User');
    
    const request = await OffboardingRequest.findById(id);

    if (!request) {
      return res.status(404).json({ success: false, message: 'Offboarding request not found' });
    }

    // Manually populate employee data from tenant database
    const { getTenantModels } = require('../../utils/tenantModels');
    const { Employee: TenantEmployee, Department: TenantDepartment } = getTenantModels(req.tenant.connection);

    let employeeData = null;
    if (request.employeeId) {
      if (request.status === 'closed' && request.employeeSnapshot) {
        // If offboarding is closed and snapshot exists, use archived employee data
        let departmentData = null;
        if (request.employeeSnapshot.department) {
          // Try to populate department name from snapshot
          try {
            const department = await TenantDepartment.findById(request.employeeSnapshot.department).select('name');
            departmentData = department ? { name: department.name } : null;
          } catch (error) {
            departmentData = null;
          }
        }

        employeeData = {
          ...request.employeeSnapshot,
          department: departmentData,
          reportingManager: request.employeeSnapshot.reportingManager
        };
      } else {
        // Otherwise, fetch live employee data
        employeeData = await TenantEmployee.findById(request.employeeId)
          .populate('department', 'name')
          .populate('reportingManager', 'firstName lastName email');
      }
    }

    // Transform to match frontend expectations (legacy format)
    const transformedData = {
      _id: request._id,
      employee: employeeData ? {
        firstName: employeeData.firstName,
        lastName: employeeData.lastName,
        email: employeeData.email,
        employeeCode: employeeData.employeeCode,
        department: employeeData.department,
        designation: employeeData.designation,
        joiningDate: employeeData.joiningDate,
        phone: employeeData.phone,
        address: employeeData.address,
        reportingManager: employeeData.reportingManager
      } : null,
      initiatedBy: request.initiatedBy,
      lastWorkingDate: request.lastWorkingDay,
      resignationType: request.reason === 'voluntary_resignation' ? 'voluntary' : 'involuntary',
      reason: request.reason,
      reasonDetails: request.reasonDetails,
      stages: ['initiation', 'manager_approval', 'hr_approval', 'finance_approval', 'checklist_generation', 'departmental_clearance', 'asset_return', 'knowledge_transfer', 'final_settlement', 'exit_interview', 'closure'],
      currentStage: request.currentStage,
      status: request.status === 'closed' ? 'completed' : request.status === 'cancelled' ? 'cancelled' : 'in-progress',
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      notes: request.notes || [],

      // Add legacy-compatible fields
      clearance: {
        hr: { cleared: false, notes: '' },
        finance: { cleared: false, notes: '' },
        it: { cleared: false, notes: '' },
        admin: { cleared: false, notes: '' }
      },
      exitInterview: {
        completed: request.status === 'closed',
        feedback: ''
      },
      finalSettlement: {
        amount: 0,
        paymentStatus: 'pending'
      },
      assetsReturned: []
    };

    res.status(200).json({
      success: true,
      data: transformedData
    });
  } catch (error) {
    console.error('Error fetching offboarding request:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Initiate new offboarding process
 */
exports.initiateOffboarding = async (req, res) => {
  try {
    const { employeeId, reason, reasonDetails, lastWorkingDay, noticePeriod, priority = 'medium' } = req.body;
    
    const offboardingData = {
      employeeId,
      clientId: req.tenant.clientId,
      reason,
      reasonDetails,
      lastWorkingDay: new Date(lastWorkingDay),
      noticePeriod,
      priority
    };

    const offboardingRequest = await offboardingWorkflow.initiateOffboarding(
      req.tenant.connection,
      offboardingData,
      req.user._id
    );

    // Get employee data for transformation
    const { getTenantModels } = require('../../utils/tenantModels');
    const { Employee: TenantEmployee } = getTenantModels(req.tenant.connection);
    const employeeData = await TenantEmployee.findById(employeeId);

    // Transform to match frontend expectations (legacy format)
    const transformedData = {
      _id: offboardingRequest._id,
      employee: employeeData ? {
        firstName: employeeData.firstName,
        lastName: employeeData.lastName,
        email: employeeData.email,
        employeeCode: employeeData.employeeCode
      } : null,
      initiatedBy: offboardingRequest.initiatedBy,
      lastWorkingDate: offboardingRequest.lastWorkingDay,
      resignationType: offboardingRequest.reason === 'voluntary_resignation' ? 'voluntary' : 'involuntary',
      reason: offboardingRequest.reason,
      stages: ['initiation', 'manager_approval', 'hr_approval', 'finance_approval', 'checklist_generation', 'departmental_clearance', 'asset_return', 'knowledge_transfer', 'final_settlement', 'exit_interview', 'closure'],
      currentStage: offboardingRequest.currentStage,
      status: offboardingRequest.status === 'closed' ? 'completed' : offboardingRequest.status === 'cancelled' ? 'cancelled' : 'in-progress',
      createdAt: offboardingRequest.createdAt,
      updatedAt: offboardingRequest.updatedAt
    };

    res.status(201).json({
      success: true,
      message: 'Offboarding process initiated successfully',
      data: transformedData
    });
  } catch (error) {
    console.error('Error initiating offboarding:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Approve offboarding at current stage
 */
exports.approveOffboarding = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments, approved = true } = req.body;
    
    const OffboardingRequest = getTenantModel(req.tenant.connection, 'OffboardingRequest', offboardingRequestSchema);
    const request = await OffboardingRequest.findById(id);

    if (!request) {
      return res.status(404).json({ success: false, message: 'Offboarding request not found' });
    }

    // Find pending approval for current user
    const pendingApproval = request.approvals.find(
      approval => approval.approver.toString() === req.user._id.toString() && approval.status === 'pending'
    );

    if (!pendingApproval) {
      return res.status(400).json({ success: false, message: 'No pending approval found for current user' });
    }

    // Update approval
    pendingApproval.status = approved ? 'approved' : 'rejected';
    pendingApproval.comments = comments;
    pendingApproval[approved ? 'approvedAt' : 'rejectedAt'] = new Date();
    if (!approved) pendingApproval.rejectionReason = comments;

    await request.save();

    // If approved, advance to next stage
    if (approved) {
      await offboardingWorkflow.advanceToNextStage(req.tenant.connection, id, req.user._id, comments);
    }

    res.status(200).json({
      success: true,
      message: `Offboarding ${approved ? 'approved' : 'rejected'} successfully`,
      data: request
    });
  } catch (error) {
    console.error('Error approving offboarding:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== TASK MANAGEMENT ====================

/**
 * Get tasks for offboarding request
 */
exports.getOffboardingTasks = async (req, res) => {
  try {
    const { id } = req.params;
    const { department, status, assignedTo } = req.query;
    
    const OffboardingTask = getTenantModel(req.tenant.connection, 'OffboardingTask', offboardingTaskSchema);
    
    let query = { offboardingRequestId: id };
    if (department) query.department = department;
    if (status) query.status = status;
    if (assignedTo) query.assignedTo = assignedTo;

    const tasks = await OffboardingTask.find(query)
      .populate('assignedTo', 'email firstName lastName')
      .populate('completedBy', 'email firstName lastName')
      .sort({ dueDate: 1 });

    res.status(200).json({ success: true, data: tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update task status
 */
exports.updateTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status, completionNotes, checklist } = req.body;
    
    const OffboardingTask = getTenantModel(req.tenant.connection, 'OffboardingTask', offboardingTaskSchema);
    const task = await OffboardingTask.findById(taskId);

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    // Update task
    if (status) task.status = status;
    if (completionNotes) task.completionNotes = completionNotes;
    if (checklist) task.checklist = checklist;
    
    if (status === 'completed') {
      task.completedBy = req.user._id;
      task.completedAt = new Date();
    }

    await task.save();

    res.status(200).json({
      success: true,
      message: 'Task updated successfully',
      data: task
    });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== ASSET CLEARANCE ====================

/**
 * Get asset clearance details
 */
exports.getAssetClearance = async (req, res) => {
  try {
    const { id } = req.params;
    const AssetClearance = getTenantModel(req.tenant.connection, 'AssetClearance', assetClearanceSchema);
    
    const clearance = await AssetClearance.findOne({ offboardingRequestId: id })
      .populate('employeeId', 'firstName lastName email');

    res.status(200).json({ success: true, data: clearance });
  } catch (error) {
    console.error('Error fetching asset clearance:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update asset return status
 */
exports.updateAssetReturn = async (req, res) => {
  try {
    const { id } = req.params;
    const { assetId, returnStatus, conditionAtReturn, notes } = req.body;
    
    const AssetClearance = getTenantModel(req.tenant.connection, 'AssetClearance', assetClearanceSchema);
    const clearance = await AssetClearance.findOne({ offboardingRequestId: id });

    if (!clearance) {
      return res.status(404).json({ success: false, message: 'Asset clearance not found' });
    }

    // Find and update asset
    const asset = clearance.physicalAssets.id(assetId);
    if (!asset) {
      return res.status(404).json({ success: false, message: 'Asset not found' });
    }

    asset.returnStatus = returnStatus;
    asset.conditionAtReturn = conditionAtReturn;
    asset.notes = notes;
    asset.returnDate = new Date();
    asset.returnedTo = req.user._id;

    await clearance.save();

    res.status(200).json({
      success: true,
      message: 'Asset return updated successfully',
      data: clearance
    });
  } catch (error) {
    console.error('Error updating asset return:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== FINAL SETTLEMENT ====================

/**
 * Get final settlement details
 */
exports.getFinalSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const FinalSettlement = getTenantModel(req.tenant.connection, 'FinalSettlement', finalSettlementSchema);
    
    const settlement = await FinalSettlement.findOne({ offboardingRequestId: id })
      .populate('employeeId', 'firstName lastName email')
      .populate('calculatedBy', 'email firstName lastName');

    res.status(200).json({ success: true, data: settlement });
  } catch (error) {
    console.error('Error fetching final settlement:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Calculate final settlement
 */
exports.calculateSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const settlementData = req.body;
    
    const FinalSettlement = getTenantModel(req.tenant.connection, 'FinalSettlement', finalSettlementSchema);
    let settlement = await FinalSettlement.findOne({ offboardingRequestId: id });

    if (!settlement) {
      settlement = new FinalSettlement({
        offboardingRequestId: id,
        clientId: req.tenant.clientId,
        employeeId: settlementData.employeeId
      });
    }

    // Update settlement data
    Object.assign(settlement, settlementData);
    settlement.calculatedBy = req.user._id;
    settlement.calculatedAt = new Date();
    settlement.calculationStatus = 'calculated';

    await settlement.save();

    res.status(200).json({
      success: true,
      message: 'Settlement calculated successfully',
      data: settlement
    });
  } catch (error) {
    console.error('Error calculating settlement:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== EXIT FEEDBACK ====================

/**
 * Get exit feedback
 */
exports.getExitFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const ExitFeedback = getTenantModel(req.tenant.connection, 'ExitFeedback', exitFeedbackSchema);
    
    const feedback = await ExitFeedback.findOne({ offboardingRequestId: id })
      .populate('employeeId', 'firstName lastName email');

    res.status(200).json({ success: true, data: feedback });
  } catch (error) {
    console.error('Error fetching exit feedback:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Submit exit feedback
 */
exports.submitExitFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const feedbackData = req.body;
    
    const ExitFeedback = getTenantModel(req.tenant.connection, 'ExitFeedback', exitFeedbackSchema);
    let feedback = await ExitFeedback.findOne({ offboardingRequestId: id });

    if (!feedback) {
      feedback = new ExitFeedback({
        offboardingRequestId: id,
        clientId: req.tenant.clientId,
        employeeId: feedbackData.employeeId
      });
    }

    // Update feedback data
    Object.assign(feedback, feedbackData);
    feedback.completionStatus = 'completed';
    feedback.completedAt = new Date();

    await feedback.save();

    res.status(200).json({
      success: true,
      message: 'Exit feedback submitted successfully',
      data: feedback
    });
  } catch (error) {
    console.error('Error submitting exit feedback:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== REPORTING & ANALYTICS ====================

/**
 * Get offboarding analytics
 */
exports.getOffboardingAnalytics = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const OffboardingRequest = getTenantModel(req.tenant.connection, 'OffboardingRequest', offboardingRequestSchema);
    
    const matchStage = { clientId: req.tenant.clientId };
    if (fromDate || toDate) {
      matchStage.createdAt = {};
      if (fromDate) matchStage.createdAt.$gte = new Date(fromDate);
      if (toDate) matchStage.createdAt.$lte = new Date(toDate);
    }

    const analytics = await OffboardingRequest.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          completedRequests: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
          avgProcessingTime: { $avg: '$processingDuration' },
          reasonBreakdown: {
            $push: '$reason'
          }
        }
      }
    ]);

    res.status(200).json({ success: true, data: analytics[0] || {} });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Close offboarding process
 */
exports.closeOffboarding = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;
    
    const OffboardingRequest = getTenantModel(req.tenant.connection, 'OffboardingRequest', offboardingRequestSchema);
    const request = await OffboardingRequest.findById(id);

    if (!request) {
      return res.status(404).json({ success: false, message: 'Offboarding request not found' });
    }


    // Complete the offboarding process
    await offboardingWorkflow.completeOffboarding(req.tenant.connection, request);


    res.status(200).json({
      success: true,
      message: 'Offboarding process completed successfully',
      data: request
    });
  } catch (error) {
    console.error('Error closing offboarding:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fix existing completed offboardings - process employees who were completed before the ex-employee feature
 */
exports.fixCompletedOffboardings = async (req, res) => {
  try {
    const OffboardingRequest = getTenantModel(req.tenant.connection, 'OffboardingRequest', offboardingRequestSchema);
    const TenantEmployee = getTenantModel(req.tenant.connection, 'Employee', require('../../models/tenant/TenantEmployee'));
    
    // Find all closed/completed offboarding requests
    const completedOffboardings = await OffboardingRequest.find({
      status: 'closed',
      isCompleted: true
    });

    let processed = 0;
    let errors = [];

    for (const offboarding of completedOffboardings) {
      try {
        // Check if employee is already marked as ex-employee
        const employee = await TenantEmployee.findById(offboarding.employeeId);
        
        if (employee && !employee.isExEmployee) {
          // Process this offboarding to mark employee as ex-employee
          await offboardingWorkflow.completeOffboarding(req.tenant.connection, offboarding);
          processed++;
          console.log(`✅ Fixed offboarding for employee ${employee.employeeCode}`);
        } else if (employee && employee.isExEmployee) {
          console.log(`ℹ️  Employee ${employee.employeeCode} already marked as ex-employee`);
        } else {
          console.warn(`⚠️  Employee not found for offboarding ${offboarding._id}`);
        }
      } catch (error) {
        errors.push({
          offboardingId: offboarding._id,
          error: error.message
        });
        console.error(`❌ Error processing offboarding ${offboarding._id}:`, error);
      }
    }

    res.status(200).json({
      success: true,
      message: `Processed ${processed} completed offboardings`,
      data: {
        total: completedOffboardings.length,
        processed,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    console.error('Error fixing completed offboardings:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
