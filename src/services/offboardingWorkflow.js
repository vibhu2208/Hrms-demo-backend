const { getTenantModel } = require('../middlewares/tenantMiddleware');
const offboardingRequestSchema = require('../models/tenant/OffboardingRequest');
const offboardingTaskSchema = require('../models/tenant/OffboardingTask');
const handoverDetailSchema = require('../models/tenant/HandoverDetail');
const assetClearanceSchema = require('../models/tenant/AssetClearance');
const finalSettlementSchema = require('../models/tenant/FinalSettlement');
const exitFeedbackSchema = require('../models/tenant/ExitFeedback');

/**
 * Offboarding Workflow Engine
 * Phase 2: Workflow Definition and State Management
 */
class OffboardingWorkflowEngine {
  constructor() {
    this.workflowStates = {
      INITIATION: 'initiation',
      MANAGER_APPROVAL: 'manager_approval',
      HR_APPROVAL: 'hr_approval',
      FINANCE_APPROVAL: 'finance_approval',
      CHECKLIST_GENERATION: 'checklist_generation',
      DEPARTMENTAL_CLEARANCE: 'departmental_clearance',
      ASSET_RETURN: 'asset_return',
      KNOWLEDGE_TRANSFER: 'knowledge_transfer',
      FINAL_SETTLEMENT: 'final_settlement',
      EXIT_INTERVIEW: 'exit_interview',
      CLOSURE: 'closure'
    };

    this.workflowStatus = {
      DRAFT: 'draft',
      INITIATED: 'initiated',
      APPROVALS_PENDING: 'approvals_pending',
      CHECKLIST_ACTIVE: 'checklist_active',
      CLEARANCE_IN_PROGRESS: 'clearance_in_progress',
      SETTLEMENT_PENDING: 'settlement_pending',
      FEEDBACK_PENDING: 'feedback_pending',
      CLOSED: 'closed',
      CANCELLED: 'cancelled'
    };

    this.stateTransitions = {
      [this.workflowStates.INITIATION]: [this.workflowStates.MANAGER_APPROVAL],
      [this.workflowStates.MANAGER_APPROVAL]: [this.workflowStates.HR_APPROVAL, this.workflowStates.INITIATION],
      [this.workflowStates.HR_APPROVAL]: [this.workflowStates.FINANCE_APPROVAL, this.workflowStates.MANAGER_APPROVAL],
      [this.workflowStates.FINANCE_APPROVAL]: [this.workflowStates.CHECKLIST_GENERATION, this.workflowStates.HR_APPROVAL],
      [this.workflowStates.CHECKLIST_GENERATION]: [this.workflowStates.DEPARTMENTAL_CLEARANCE],
      [this.workflowStates.DEPARTMENTAL_CLEARANCE]: [this.workflowStates.ASSET_RETURN],
      [this.workflowStates.ASSET_RETURN]: [this.workflowStates.KNOWLEDGE_TRANSFER],
      [this.workflowStates.KNOWLEDGE_TRANSFER]: [this.workflowStates.FINAL_SETTLEMENT],
      [this.workflowStates.FINAL_SETTLEMENT]: [this.workflowStates.EXIT_INTERVIEW],
      [this.workflowStates.EXIT_INTERVIEW]: [this.workflowStates.CLOSURE],
      [this.workflowStates.CLOSURE]: []
    };
  }

  /**
   * Initialize offboarding workflow
   */
  async initiateOffboarding(tenantConnection, offboardingData, initiatedBy) {
    try {
      const OffboardingRequest = getTenantModel(tenantConnection, 'OffboardingRequest', offboardingRequestSchema);
      
      // Create main offboarding request
      const offboardingRequest = new OffboardingRequest({
        ...offboardingData,
        initiatedBy,
        status: this.workflowStatus.INITIATED,
        currentStage: this.workflowStates.INITIATION,
        initiatedAt: new Date(),
        statusHistory: [{
          status: this.workflowStatus.INITIATED,
          changedBy: initiatedBy,
          changedAt: new Date(),
          reason: 'Offboarding process initiated'
        }]
      });

      await offboardingRequest.save();

      // Auto-advance to manager approval if all required data is present
      if (this.canAdvanceToNextStage(offboardingRequest)) {
        await this.advanceToNextStage(tenantConnection, offboardingRequest._id, initiatedBy);
      }

      return offboardingRequest;
    } catch (error) {
      console.error('Error initiating offboarding:', error);
      throw error;
    }
  }

  /**
   * Advance workflow to next stage
   */
  async advanceToNextStage(tenantConnection, offboardingRequestId, userId, comments = '') {
    try {
      const OffboardingRequest = getTenantModel(tenantConnection, 'OffboardingRequest', offboardingRequestSchema);
      const offboardingRequest = await OffboardingRequest.findById(offboardingRequestId);

      if (!offboardingRequest) {
        throw new Error('Offboarding request not found');
      }

      const currentStage = offboardingRequest.currentStage;
      const nextStages = this.stateTransitions[currentStage];

      if (!nextStages || nextStages.length === 0) {
        throw new Error('No valid next stage available');
      }

      const nextStage = nextStages[0]; // Take first valid transition
      
      // Validate stage transition
      if (!this.validateStageTransition(offboardingRequest, nextStage)) {
        throw new Error(`Cannot transition from ${currentStage} to ${nextStage}`);
      }

      // Update stage and status
      offboardingRequest.currentStage = nextStage;
      offboardingRequest.status = this.getStatusForStage(nextStage);
      
      // Add to status history
      offboardingRequest.statusHistory.push({
        status: offboardingRequest.status,
        changedBy: userId,
        changedAt: new Date(),
        reason: comments || `Advanced to ${nextStage}`
      });

      await offboardingRequest.save();

      // Execute stage-specific actions
      await this.executeStageActions(tenantConnection, offboardingRequest, userId);

      return offboardingRequest;
    } catch (error) {
      console.error('Error advancing workflow stage:', error);
      throw error;
    }
  }

  /**
   * Execute actions specific to each workflow stage
   */
  async executeStageActions(tenantConnection, offboardingRequest, userId) {
    const stage = offboardingRequest.currentStage;

    switch (stage) {
      case this.workflowStates.MANAGER_APPROVAL:
        // Skip manager approval for now and go directly to HR approval
        console.log('Skipping manager approval - advancing to HR approval');
        await this.advanceToNextStage(tenantConnection, offboardingRequest._id, null, 'Manager approval skipped - advancing to HR approval');
        break;
      
      case this.workflowStates.HR_APPROVAL:
        await this.setupHRApproval(tenantConnection, offboardingRequest);
        break;
      
      case this.workflowStates.FINANCE_APPROVAL:
        await this.setupFinanceApproval(tenantConnection, offboardingRequest);
        break;
      
      case this.workflowStates.CHECKLIST_GENERATION:
        await this.generateOffboardingTasks(tenantConnection, offboardingRequest, userId);
        break;
      
      case this.workflowStates.DEPARTMENTAL_CLEARANCE:
        await this.initiateDepartmentalClearance(tenantConnection, offboardingRequest);
        break;
      
      case this.workflowStates.ASSET_RETURN:
        await this.initiateAssetClearance(tenantConnection, offboardingRequest);
        break;
      
      case this.workflowStates.KNOWLEDGE_TRANSFER:
        await this.initiateKnowledgeTransfer(tenantConnection, offboardingRequest);
        break;
      
      case this.workflowStates.FINAL_SETTLEMENT:
        await this.initiateFinalSettlement(tenantConnection, offboardingRequest);
        break;
      
      case this.workflowStates.EXIT_INTERVIEW:
        await this.initiateExitInterview(tenantConnection, offboardingRequest);
        break;
      
      case this.workflowStates.CLOSURE:
        await this.completeOffboarding(tenantConnection, offboardingRequest);
        break;
    }
  }

  /**
   * Generate departmental tasks based on employee role and company policies
   */
  async generateOffboardingTasks(tenantConnection, offboardingRequest, userId) {
    try {
      const OffboardingTask = getTenantModel(tenantConnection, 'OffboardingTask', offboardingTaskSchema);
      
      // Get employee details to determine required tasks
      const Employee = getTenantModel(tenantConnection, 'Employee', require('../models/Employee').schema);
      const employee = await Employee.findById(offboardingRequest.employeeId).populate('department');

      const tasks = await this.getTaskTemplatesForEmployee(employee, offboardingRequest);
      
      const createdTasks = [];
      for (const taskTemplate of tasks) {
        const task = new OffboardingTask({
          offboardingRequestId: offboardingRequest._id,
          clientId: offboardingRequest.clientId,
          employeeId: offboardingRequest.employeeId,
          taskName: taskTemplate.name,
          taskDescription: taskTemplate.description,
          taskType: taskTemplate.type,
          department: taskTemplate.department,
          assignedTo: taskTemplate.assignedTo,
          assignedBy: userId,
          dueDate: this.calculateTaskDueDate(offboardingRequest.lastWorkingDay, taskTemplate.daysBeforeLWD),
          priority: taskTemplate.priority,
          requiresVerification: taskTemplate.requiresVerification,
          checklist: taskTemplate.checklist || [],
          isAutoGenerated: true
        });

        await task.save();
        createdTasks.push(task);
      }

      console.log(`Generated ${createdTasks.length} offboarding tasks for employee ${offboardingRequest.employeeId}`);
      return createdTasks;
    } catch (error) {
      console.error('Error generating offboarding tasks:', error);
      throw error;
    }
  }

  /**
   * Get task templates based on employee profile
   */
  async getTaskTemplatesForEmployee(employee, offboardingRequest) {
    // This would typically come from a configuration or database
    // For now, we'll use a hardcoded template
    const baseTaskTemplates = [
      // HR Tasks
      {
        name: 'Collect resignation letter',
        description: 'Obtain formal resignation letter from employee',
        type: 'document_collection',
        department: 'hr',
        assignedTo: null, // Will be assigned to HR team lead
        daysBeforeLWD: 15,
        priority: 'high',
        requiresVerification: true,
        checklist: [
          { item: 'Resignation letter received', completed: false },
          { item: 'Letter reviewed and approved', completed: false },
          { item: 'Copy stored in employee file', completed: false }
        ]
      },
      {
        name: 'Update employee status',
        description: 'Update employee status in HRMS and related systems',
        type: 'compliance_check',
        department: 'hr',
        assignedTo: null,
        daysBeforeLWD: 10,
        priority: 'high',
        requiresVerification: true,
        checklist: [
          { item: 'HRMS status updated', completed: false },
          { item: 'Payroll system notified', completed: false },
          { item: 'Benefits provider notified', completed: false }
        ]
      },
      
      // IT Tasks
      {
        name: 'Revoke system access',
        description: 'Disable all system access and accounts',
        type: 'access_revocation',
        department: 'it',
        assignedTo: null,
        daysBeforeLWD: 1,
        priority: 'critical',
        requiresVerification: true,
        checklist: [
          { item: 'Email account disabled', completed: false },
          { item: 'VPN access revoked', completed: false },
          { item: 'System logins disabled', completed: false },
          { item: 'Access cards deactivated', completed: false }
        ]
      },
      {
        name: 'Collect IT assets',
        description: 'Retrieve all company IT equipment and assets',
        type: 'asset_return',
        department: 'it',
        assignedTo: null,
        daysBeforeLWD: 2,
        priority: 'high',
        requiresVerification: true,
        checklist: [
          { item: 'Laptop returned', completed: false },
          { item: 'Mobile phone returned', completed: false },
          { item: 'Access cards returned', completed: false },
          { item: 'Other equipment returned', completed: false }
        ]
      },
      
      // Finance Tasks
      {
        name: 'Calculate final settlement',
        description: 'Calculate final salary, benefits, and deductions',
        type: 'final_settlement',
        department: 'finance',
        assignedTo: null,
        daysBeforeLWD: 7,
        priority: 'high',
        requiresVerification: true,
        checklist: [
          { item: 'Salary calculation completed', completed: false },
          { item: 'Leave encashment calculated', completed: false },
          { item: 'Deductions calculated', completed: false },
          { item: 'Final amount approved', completed: false }
        ]
      },
      
      // Admin Tasks
      {
        name: 'Facility access cleanup',
        description: 'Remove facility access and collect access materials',
        type: 'clearance_approval',
        department: 'admin',
        assignedTo: null,
        daysBeforeLWD: 1,
        priority: 'medium',
        requiresVerification: false,
        checklist: [
          { item: 'Office keys returned', completed: false },
          { item: 'Parking pass returned', completed: false },
          { item: 'Locker cleaned out', completed: false }
        ]
      }
    ];

    // Customize tasks based on employee role/department
    return baseTaskTemplates.map(template => ({
      ...template,
      assignedTo: this.getDefaultAssigneeForDepartment(template.department, employee.clientId)
    }));
  }

  /**
   * Calculate task due date based on last working day
   */
  calculateTaskDueDate(lastWorkingDay, daysBeforeLWD) {
    const lwd = new Date(lastWorkingDay);
    const dueDate = new Date(lwd);
    dueDate.setDate(lwd.getDate() - daysBeforeLWD);
    return dueDate;
  }

  /**
   * Get default assignee for department tasks
   */
  getDefaultAssigneeForDepartment(department, clientId) {
    // This would typically query the database for department heads
    // For now, return null and let it be assigned manually
    return null;
  }

  /**
   * Setup manager approval with proper error handling
   */
  async setupManagerApproval(tenantConnection, offboardingRequest) {
    try {
      const Employee = getTenantModel(tenantConnection, 'Employee', require('../models/Employee').schema);
      const employee = await Employee.findById(offboardingRequest.employeeId);
      
      // Check if employee exists
      if (!employee) {
        console.log(`Employee not found for ID: ${offboardingRequest.employeeId}`);
        // Skip to HR approval if employee not found
        await this.advanceToNextStage(tenantConnection, offboardingRequest._id, null, 'Employee not found - auto-advancing to HR approval');
        return;
      }
      
      // Check if employee has a reporting manager
      if (employee.reportingManager) {
        // Add approval record
        offboardingRequest.approvals.push({
          stage: 'manager',
          approver: employee.reportingManager,
          status: 'pending'
        });
        await offboardingRequest.save();
        
        // Send notification to manager
        await this.sendNotification(tenantConnection, {
          type: 'offboarding_approval_required',
          recipientId: employee.reportingManager,
          offboardingRequestId: offboardingRequest._id,
          message: `Offboarding approval required for ${employee.firstName} ${employee.lastName}`
        });
      } else {
        // No manager assigned, skip to HR approval
        console.log(`No reporting manager found for employee: ${employee.firstName} ${employee.lastName}`);
        await this.advanceToNextStage(tenantConnection, offboardingRequest._id, null, 'No manager assigned - auto-advancing to HR approval');
      }
    } catch (error) {
      console.error('Error in setupManagerApproval:', error);
      // If there's any error, skip to HR approval to prevent workflow from breaking
      await this.advanceToNextStage(tenantConnection, offboardingRequest._id, null, 'Error in manager approval setup - auto-advancing to HR approval');
    }
  }

  /**
   * Setup HR approval
   */
  async setupHRApproval(tenantConnection, offboardingRequest) {
    try {
      const hrUsers = await this.getHRUsers(tenantConnection, offboardingRequest.clientId);
      
      if (hrUsers.length > 0) {
        offboardingRequest.approvals.push({
          stage: 'hr',
          approver: hrUsers[0]._id, // Assign to first HR user
          status: 'pending'
        });
        await offboardingRequest.save();
      }
    } catch (error) {
      console.error('Error in setupHRApproval:', error);
      // Continue to next stage even if HR setup fails
      await this.advanceToNextStage(tenantConnection, offboardingRequest._id, null, 'Error in HR approval setup - auto-advancing');
    }
  }

  /**
   * Setup finance approval
   */
  async setupFinanceApproval(tenantConnection, offboardingRequest) {
    // Get finance team members
    const financeUsers = await this.getFinanceUsers(tenantConnection, offboardingRequest.clientId);
    
    if (financeUsers.length > 0) {
      offboardingRequest.approvals.push({
        stage: 'finance',
        approver: financeUsers[0]._id,
        status: 'pending'
      });
      await offboardingRequest.save();
    }
  }

  /**
   * Initiate asset clearance process
   */
  async initiateAssetClearance(tenantConnection, offboardingRequest) {
    const AssetClearance = getTenantModel(tenantConnection, 'AssetClearance', assetClearanceSchema);
    
    // Get employee's assigned assets
    const Asset = getTenantModel(tenantConnection, 'Asset', require('../models/Asset').schema);
    const assignedAssets = await Asset.find({ 
      assignedTo: offboardingRequest.employeeId,
      status: 'assigned'
    });

    const assetClearance = new AssetClearance({
      offboardingRequestId: offboardingRequest._id,
      clientId: offboardingRequest.clientId,
      employeeId: offboardingRequest.employeeId,
      clearanceStartDate: new Date(),
      expectedCompletionDate: new Date(offboardingRequest.lastWorkingDay),
      physicalAssets: assignedAssets.map(asset => ({
        assetId: asset._id,
        assetType: asset.type,
        assetName: asset.name,
        assetCode: asset.assetCode,
        serialNumber: asset.serialNumber,
        brand: asset.brand,
        model: asset.model,
        assignedDate: asset.assignedDate,
        returnStatus: 'pending'
      }))
    });

    await assetClearance.save();
    return assetClearance;
  }

  /**
   * Initiate knowledge transfer process
   */
  async initiateKnowledgeTransfer(tenantConnection, offboardingRequest) {
    const HandoverDetail = getTenantModel(tenantConnection, 'HandoverDetail', handoverDetailSchema);
    
    const handoverDetail = new HandoverDetail({
      offboardingRequestId: offboardingRequest._id,
      clientId: offboardingRequest.clientId,
      employeeId: offboardingRequest.employeeId,
      overallStatus: 'not_started',
      plannedStartDate: new Date(),
      plannedCompletionDate: new Date(offboardingRequest.lastWorkingDay)
    });

    await handoverDetail.save();
    return handoverDetail;
  }

  /**
   * Initiate final settlement calculation
   */
  async initiateFinalSettlement(tenantConnection, offboardingRequest) {
    const FinalSettlement = getTenantModel(tenantConnection, 'FinalSettlement', finalSettlementSchema);
    
    const finalSettlement = new FinalSettlement({
      offboardingRequestId: offboardingRequest._id,
      clientId: offboardingRequest.clientId,
      employeeId: offboardingRequest.employeeId,
      settlementPeriod: {
        fromDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        toDate: new Date(offboardingRequest.lastWorkingDay)
      },
      calculationStatus: 'draft'
    });

    await finalSettlement.save();
    return finalSettlement;
  }

  /**
   * Initiate exit interview process
   */
  async initiateExitInterview(tenantConnection, offboardingRequest) {
    const ExitFeedback = getTenantModel(tenantConnection, 'ExitFeedback', exitFeedbackSchema);
    
    const exitFeedback = new ExitFeedback({
      offboardingRequestId: offboardingRequest._id,
      clientId: offboardingRequest.clientId,
      employeeId: offboardingRequest.employeeId,
      completionStatus: 'not_started'
    });

    await exitFeedback.save();
    return exitFeedback;
  }

  calculateExperience(joiningDate, terminationDate) {
    if (!joiningDate || !terminationDate) {
      return { years: 0, months: 0 };
    }

    const start = new Date(joiningDate);
    const end = new Date(terminationDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { years: 0, months: 0 };
    }

    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();

    if (months < 0) {
      years--;
      months += 12;
    }

    if (end.getDate() < start.getDate()) {
      months--;
      if (months < 0) {
        years--;
        months += 12;
      }
    }

    return {
      years: Math.max(0, years),
      months: Math.max(0, months)
    };
  }

  sanitizeCTC(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    if (typeof value === 'object') {
      if (value.isEncrypted) return null;
      if (typeof value.total === 'number') return Number.isFinite(value.total) ? value.total : null;
      if (typeof value.total === 'string') {
        const n = Number(value.total);
        return Number.isFinite(n) ? n : null;
      }
    }
    return null;
  }

  /**
   * Complete offboarding process
   */
  async completeOffboarding(tenantConnection, offboardingRequest) {
    // Get the complete employee data before marking as ex-employee
    const TenantEmployee = tenantConnection.models.Employee || tenantConnection.model('Employee', require('../models/tenant/TenantEmployee'));
    const TalentPool = tenantConnection.models.TalentPool || tenantConnection.model('TalentPool', require('../models/TalentPool').schema);
    const Candidate = tenantConnection.models.Candidate || tenantConnection.model('Candidate', require('../models/Candidate').schema);

    const employeeData = await TenantEmployee.findById(offboardingRequest.employeeId);


    if (!employeeData) {
      throw new Error('Employee not found');
    }

    // Check if employee is already an ex-employee
    if (employeeData.isExEmployee) {
      
      // Even if already ex-employee, ensure candidate exists
      try {
        const existingCandidate = await Candidate.findOne({
          $or: [
            { exEmployeeId: employeeData._id },
            { exEmployeeCode: employeeData.employeeCode },
            { email: employeeData.email, isExEmployee: true }
          ]
        });
        
        if (!existingCandidate) {
          // Employee is ex-employee but candidate doesn't exist - create it
          // This will be handled in the main flow below
        } else {
          console.log(`ℹ️  Employee ${employeeData.employeeCode} is already an ex-employee with candidate ${existingCandidate.candidateCode}`);
          // Still mark offboarding as completed even if employee is already processed
          if (offboardingRequest && typeof offboardingRequest.save === 'function') {
            offboardingRequest.status = 'completed';
            offboardingRequest.currentStage = 'success';
            offboardingRequest.completedAt = new Date();
            await offboardingRequest.save();
          }
          return { success: true, message: 'Employee already processed as ex-employee' };
        }
      } catch (candidateCheckError) {
        console.warn('Error checking candidate for ex-employee:', candidateCheckError);
        // Continue with normal flow
      }
    }

    if (employeeData) {
      // Store complete employee data in offboarding record
      offboardingRequest.employeeSnapshot = {
        // Basic Information
        _id: employeeData._id,
        firstName: employeeData.firstName,
        lastName: employeeData.lastName,
        email: employeeData.email,
        phone: employeeData.phone,
        employeeCode: employeeData.employeeCode,

        // Employment Information
        joiningDate: employeeData.joiningDate,
        designation: employeeData.designation,
        department: employeeData.department,
        departmentId: employeeData.departmentId,
        reportingManager: employeeData.reportingManager,

        // Salary Information
        salary: employeeData.salary,

        // Status Information
        isActive: employeeData.isActive,
        isFirstLogin: employeeData.isFirstLogin,
        mustChangePassword: employeeData.mustChangePassword,
        terminatedAt: new Date(), // Mark termination date

        // Metadata
        createdBy: employeeData.createdBy,
        createdAt: employeeData.createdAt,
        updatedAt: employeeData.updatedAt,

        // Original status before termination
        originalStatus: employeeData.status,
        terminationReason: offboardingRequest.reason,
        terminationDetails: offboardingRequest.reasonDetails,
        lastWorkingDay: offboardingRequest.lastWorkingDay
      };

      // Calculate experience from joining date to termination date
      const terminationDate = offboardingRequest.lastWorkingDay || new Date();
      const experience = this.calculateExperience(employeeData.joiningDate, terminationDate);

      // Mark employee as ex-employee instead of deleting
      employeeData.isExEmployee = true;
      employeeData.isActive = false;
      employeeData.status = 'terminated';
      employeeData.terminatedAt = terminationDate;
      employeeData.terminationReason = offboardingRequest.reason || 'Offboarding completed';
      
      // Don't modify department field - it might cause validation errors
      // Only update isExEmployee, isActive, status, and termination fields
      
      
      try {
        await employeeData.save();
      } catch (saveError) {
        console.error('❌ Failed to save employee as ex-employee:', saveError);
        // Try using updateOne directly to bypass validation if needed
        try {
          const updateResult = await TenantEmployee.updateOne(
            { _id: employeeData._id },
            { 
              $set: { 
                isExEmployee: true,
                isActive: false,
                status: 'terminated',
                terminatedAt: terminationDate,
                terminationReason: offboardingRequest.reason || 'Offboarding completed'
              }
            },
            { runValidators: false } // Bypass validation
          );
          
          // Verify the update worked by re-fetching
          const verifyAfterUpdate = await TenantEmployee.findById(employeeData._id).lean();
          
          if (verifyAfterUpdate && verifyAfterUpdate.isExEmployee !== true) {
            // Update didn't work, try using findByIdAndUpdate
            await TenantEmployee.findByIdAndUpdate(
              employeeData._id,
              { 
                $set: { 
                  isExEmployee: true,
                  isActive: false,
                  status: 'terminated',
                  terminatedAt: terminationDate,
                  terminationReason: offboardingRequest.reason || 'Offboarding completed'
                }
              },
              { new: true, runValidators: false }
            );
          }
          
          console.log(`✅ Employee ${employeeData.employeeCode} marked as ex-employee using updateOne`);
        } catch (updateError) {
          throw new Error(`Failed to mark employee as ex-employee: ${updateError.message}`);
        }
      }
      
      // Verify the save by re-fetching from database
      const verifyEmployee = await TenantEmployee.findById(employeeData._id).lean();

      // Add ex-employee to talent pool (non-blocking)
      try {
        console.log(`🔄 Adding ex-employee to talent pool: ${employeeData.firstName} ${employeeData.lastName}`);

        const talentPoolData = {
          name: `${employeeData.firstName} ${employeeData.lastName}`,
          email: employeeData.email,
          phone: employeeData.phone || '',
          desiredDepartment: employeeData.department || 'General',
          desiredPosition: employeeData.designation || 'Previous Role',
          experience: {
            years: experience.years,
            months: experience.months
          },
          currentCompany: 'Previous Employer',
          currentDesignation: employeeData.designation,
          currentCTC: this.sanitizeCTC(employeeData.salary?.total ?? employeeData.salary),
          skills: [],
          status: 'new',
          isExEmployee: true,
          exEmployeeId: employeeData._id,
          exEmployeeCode: employeeData.employeeCode,
          comments: `Ex-employee from ${employeeData.department || 'General'} department. ${offboardingRequest.reason ? `Reason: ${offboardingRequest.reason}` : ''}`,
          timeline: [{
            action: 'Added from Offboarding',
            description: `Employee offboarding completed. Previous employee code: ${employeeData.employeeCode}. Experience: ${experience.years} years ${experience.months} months.`,
            timestamp: new Date()
          }]
        };

        const talentPoolEntry = await TalentPool.create(talentPoolData);
        console.log(`✅ Employee ${employeeData.firstName} ${employeeData.lastName} (${employeeData.employeeCode}) added to talent pool (${talentPoolEntry.talentCode})`);
      } catch (talentPoolError) {
        console.error('⚠️  Error adding ex-employee to talent pool:', talentPoolError);
      }

      // Add ex-employee to candidate pool (must run even if TalentPool fails)
      try {
        console.log(`🔄 Adding ex-employee to candidate pool: ${employeeData.firstName} ${employeeData.lastName}`);

        const empFirstName = String(employeeData.firstName || '').trim();
        const empLastName = String(employeeData.lastName || '').trim();
        const empEmail = String(employeeData.email || '').trim();
        const empPhone = String(employeeData.phone || '').trim();
        const empCode = String(employeeData.employeeCode || '').trim();

        // Check for existing candidate by email first (most likely scenario)
        let existingCandidate = await Candidate.findOne({
          email: empEmail
        });

        // If not found by email, check by ex-employee identifiers
        if (!existingCandidate) {
          existingCandidate = await Candidate.findOne({
            $or: [
              { exEmployeeId: employeeData._id },
              { exEmployeeCode: empCode }
            ]
          });
        }
        
        if (existingCandidate) {
          console.log(`🔄 Updating existing candidate to ex-employee status: ${existingCandidate.candidateCode}`);
          
          // Update existing candidate to ex-employee
          existingCandidate.isExEmployee = true;
          existingCandidate.exEmployeeId = employeeData._id;
          existingCandidate.exEmployeeCode = empCode;
          existingCandidate.firstName = empFirstName;
          existingCandidate.lastName = empLastName;
          existingCandidate.currentDesignation = employeeData.designation || 'Previous Role';
          existingCandidate.currentCTC = this.sanitizeCTC(employeeData.salary?.total ?? employeeData.salary);
          existingCandidate.experience = {
            years: experience.years,
            months: experience.months
          };
          
          // Add timeline entry for offboarding
          existingCandidate.timeline = existingCandidate.timeline || [];
          existingCandidate.timeline.push({
            action: 'Marked as Ex-Employee',
            description: `Employee offboarding completed. Previous employee code: ${empCode}. Experience: ${experience.years} years ${experience.months} months.`,
            timestamp: new Date()
          });

          // Add workflow history entry
          existingCandidate.workflowHistory = existingCandidate.workflowHistory || [];
          existingCandidate.workflowHistory.push({
            fromStage: existingCandidate.stage,
            toStage: existingCandidate.stage, // Keep same stage but mark as ex-employee
            reason: `Employee offboarded: ${offboardingRequest.reason || 'Offboarding completed'}`,
            timestamp: new Date()
          });

          await existingCandidate.save();
          console.log(`✅ Updated existing candidate ${existingCandidate.candidateCode} to ex-employee status`);
        } else {
          const candidateData = {
            firstName: empFirstName,
            lastName: empLastName,
            email: empEmail,
            phone: empPhone,
            currentLocation: employeeData.address?.city || employeeData.address || '',
            experience: {
              years: experience.years,
              months: experience.months
            },
            currentCompany: 'Previous Employer',
            currentDesignation: employeeData.designation || 'Previous Role',
            currentCTC: this.sanitizeCTC(employeeData.salary?.total ?? employeeData.salary),
            skills: employeeData.skills || [],
            source: 'internal',
            stage: 'applied',
            status: 'active',
            isExEmployee: true,
            exEmployeeId: employeeData._id,
            exEmployeeCode: empCode,
            notes: `Ex-employee from ${employeeData.department || 'General'} department. ${offboardingRequest.reason ? `Reason: ${offboardingRequest.reason}` : ''}`,
            timeline: [{
              action: 'Added from Offboarding',
              description: `Employee offboarding completed. Previous employee code: ${empCode}. Experience: ${experience.years} years ${experience.months} months.`,
              timestamp: new Date()
            }]
          };

          const candidateEntry = await Candidate.create(candidateData);
          console.log(`✅ Ex-employee ${empFirstName} ${empLastName} (${empCode}) added to candidate pool (${candidateEntry.candidateCode})`);
        }
      } catch (candidateError) {
        console.error('⚠️  Error adding ex-employee to candidate pool:', candidateError);
      }

      console.log(`✅ Employee ${employeeData.firstName} ${employeeData.lastName} (${employeeData.employeeCode}) marked as ex-employee`);
    } else {
      console.warn(`⚠️  Employee ${offboardingRequest.employeeId} not found in employees collection during offboarding completion`);
    }

    // Update offboarding record status
    offboardingRequest.status = this.workflowStatus.CLOSED;
    offboardingRequest.isCompleted = true;
    offboardingRequest.completedAt = new Date();
    offboardingRequest.completionPercentage = 100;

    await offboardingRequest.save();
  }

  /**
   * Validate stage transition
   */
  validateStageTransition(offboardingRequest, nextStage) {
    const currentStage = offboardingRequest.currentStage;
    const validTransitions = this.stateTransitions[currentStage];
    return validTransitions && validTransitions.includes(nextStage);
  }

  /**
   * Get status for workflow stage
   */
  getStatusForStage(stage) {
    const stageStatusMap = {
      [this.workflowStates.INITIATION]: this.workflowStatus.INITIATED,
      [this.workflowStates.MANAGER_APPROVAL]: this.workflowStatus.APPROVALS_PENDING,
      [this.workflowStates.HR_APPROVAL]: this.workflowStatus.APPROVALS_PENDING,
      [this.workflowStates.FINANCE_APPROVAL]: this.workflowStatus.APPROVALS_PENDING,
      [this.workflowStates.CHECKLIST_GENERATION]: this.workflowStatus.CHECKLIST_ACTIVE,
      [this.workflowStates.DEPARTMENTAL_CLEARANCE]: this.workflowStatus.CLEARANCE_IN_PROGRESS,
      [this.workflowStates.ASSET_RETURN]: this.workflowStatus.CLEARANCE_IN_PROGRESS,
      [this.workflowStates.KNOWLEDGE_TRANSFER]: this.workflowStatus.CLEARANCE_IN_PROGRESS,
      [this.workflowStates.FINAL_SETTLEMENT]: this.workflowStatus.SETTLEMENT_PENDING,
      [this.workflowStates.EXIT_INTERVIEW]: this.workflowStatus.FEEDBACK_PENDING,
      [this.workflowStates.CLOSURE]: this.workflowStatus.CLOSED
    };
    
    return stageStatusMap[stage] || this.workflowStatus.INITIATED;
  }

  /**
   * Check if workflow can advance to next stage
   */
  canAdvanceToNextStage(offboardingRequest) {
    // Add validation logic based on current stage requirements
    return true; // Simplified for now
  }

  /**
   * Send notification (placeholder)
   */
  async sendNotification(tenantConnection, notificationData) {
    // Implementation would integrate with notification service
    console.log('Notification sent:', notificationData);
  }

  /**
   * Get HR users for tenant
   */
  async getHRUsers(tenantConnection, clientId) {
    const User = getTenantModel(tenantConnection, 'User', require('../models/User').schema);
    return await User.find({ clientId, role: 'hr', isActive: true });
  }

  /**
   * Get finance users for tenant
   */
  async getFinanceUsers(tenantConnection, clientId) {
    const User = getTenantModel(tenantConnection, 'User', require('../models/User').schema);
    return await User.find({ clientId, role: 'admin', isActive: true }); // Assuming admin handles finance
  }
}

module.exports = new OffboardingWorkflowEngine();
