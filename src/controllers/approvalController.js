const { getTenantConnection } = require('../config/database.config');
const approvalEngine = require('../services/approvalEngine');
const approvalValidationService = require('../services/approvalValidationService');
const auditService = require('../services/auditService');
const { getTenantModel } = require('../utils/tenantModels');

/**
 * Get pending approvals for current user
 */
exports.getMyPendingApprovals = async (req, res) => {
  try {
    const companyId = req.companyId;
    const userId = req.user.userId || req.user._id;

    const tenantConnection = await getTenantConnection(companyId);
    const ApprovalInstanceSchema = require('../models/tenant/ApprovalInstance');
    const ApprovalInstance = tenantConnection.model('ApprovalInstance', ApprovalInstanceSchema);

    const approvals = await ApprovalInstance.find({
      'approvalChain.approverId': userId,
      'approvalChain.status': 'pending',
      status: 'pending'
    })
    .sort({ createdAt: -1 });

    // Try to populate requestedBy, but don't fail if it doesn't work
    let populatedApprovals = approvals;
    try {
      populatedApprovals = await ApprovalInstance.populate(approvals, {
        path: 'requestedBy',
        select: 'firstName lastName email'
      });
    } catch (populateError) {
      // Use raw approvals if populate fails
      populatedApprovals = approvals;
    }

    // Filter to only show approvals at current user's level
    const myApprovals = populatedApprovals.filter(approval => {
      const currentStep = approval.getCurrentApprover();
      return currentStep && currentStep.approverId && currentStep.approverId.toString() === userId.toString();
    });

    // Enrich onboarding approvals with full details
    const enrichedApprovals = await Promise.all(myApprovals.map(async (approval) => {
      const approvalObj = approval.toObject();
      
      if (approval.requestType === 'onboarding_approval') {
        try {
          const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
          const onboarding = await Onboarding.findById(approval.requestId)
            .populate('applicationId', 'firstName lastName email phone candidateCode resume')
            .populate('department', 'name')
            .populate('jobId', 'title department')
            .populate('assignedHR', 'firstName lastName email');
          
          if (onboarding) {
            approvalObj.onboardingDetails = {
              onboardingId: onboarding.onboardingId,
              candidateName: onboarding.candidateName,
              candidateEmail: onboarding.candidateEmail,
              candidatePhone: onboarding.candidatePhone,
              position: onboarding.position,
              department: onboarding.department?.name || 'N/A',
              candidateCode: onboarding.applicationId?.candidateCode || 'N/A',
              resumeUrl: onboarding.applicationId?.resume || null,
              assignedHR: onboarding.assignedHR ? {
                name: `${onboarding.assignedHR.firstName} ${onboarding.assignedHR.lastName}`,
                email: onboarding.assignedHR.email
              } : null,
              createdAt: onboarding.createdAt
            };
          }
        } catch (err) {
          console.error('Error fetching onboarding details for approval:', err);
        }
      }
      
      return approvalObj;
    }));

    res.json({
      success: true,
      count: enrichedApprovals.length,
      data: enrichedApprovals
    });
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending approvals',
      error: error.message
    });
  }
};

/**
 * Get approval history for a request
 */
exports.getApprovalHistory = async (req, res) => {
  try {
    const { requestType, requestId } = req.params;
    const companyId = req.companyId;

    const tenantConnection = await getTenantConnection(companyId);
    const ApprovalInstanceSchema = require('../models/tenant/ApprovalInstance');
    const ApprovalInstance = tenantConnection.model('ApprovalInstance', ApprovalInstanceSchema);

    const instance = await ApprovalInstance.findOne({
      requestType,
      requestId
    })
    .populate('requestedBy', 'firstName lastName email')
    .populate('approvalChain.approverId', 'firstName lastName email')
    .populate('history.performedBy', 'firstName lastName email');

    if (!instance) {
      return res.status(404).json({
        success: false,
        message: 'Approval instance not found'
      });
    }

    res.json({
      success: true,
      data: instance
    });
  } catch (error) {
    console.error('Error fetching approval history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch approval history',
      error: error.message
    });
  }
};

/**
 * Approve a request
 */
exports.approveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;
    const companyId = req.companyId;
    const userId = req.user.userId || req.user._id;

    const tenantConnection = await getTenantConnection(companyId);
    const ApprovalInstanceSchema = require('../models/tenant/ApprovalInstance');
    const ApprovalInstance = tenantConnection.model('ApprovalInstance', ApprovalInstanceSchema);

    // Get the approval instance
    const instance = await ApprovalInstance.findById(id);
    if (!instance) {
      return res.status(404).json({
        success: false,
        message: 'Approval request not found'
      });
    }

    // Special handling for onboarding approvals - skip standard validation
    if (instance.requestType === 'onboarding_approval') {
      // Validate that current user is the approver
      const currentApprover = instance.getCurrentApprover();
      if (!currentApprover || currentApprover.approverId.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to approve this request'
        });
      }
      
      // Process approval for onboarding
      currentApprover.status = 'approved';
      currentApprover.actionDate = new Date();
      currentApprover.comments = comments;
      
      instance.status = 'approved';
      instance.slaStatus.actualCompletionDate = new Date();
      instance.history.push({
        action: 'APPROVED',
        performedBy: userId,
        timestamp: new Date(),
        details: { comments, level: instance.currentLevel }
      });
      
      await instance.save();
      
      // Update the onboarding record
      const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
      const onboarding = await Onboarding.findById(instance.requestId);
      
      if (onboarding) {
        const TenantUserSchema = require('../models/tenant/TenantUser');
        const TenantUser = tenantConnection.model('User', TenantUserSchema);
        const adminUser = await TenantUser.findById(userId).select('firstName lastName email');
        
        onboarding.status = 'payslip_upload_requested'; // Move to payslip upload request after approval
        onboarding.approvalStatus.status = 'approved';
        onboarding.approvalStatus.approvedBy = userId;
        onboarding.approvalStatus.approvedAt = new Date();
        onboarding.approvalStatus.comments = comments;
        onboarding.approvalStatus.canReRequest = false;
        
        onboarding.auditTrail.push({
          action: 'approval_granted',
          description: `Approval granted by ${adminUser?.firstName || 'Admin'} ${adminUser?.lastName || ''}`,
          performedBy: userId,
          previousStatus: 'pending_approval',
          newStatus: 'payslip_upload_requested',
          metadata: { comments },
          timestamp: new Date()
        });
        
        await onboarding.save();
      }
      
      return res.json({
        success: true,
        message: 'Onboarding approval granted. HR can now request payslip verification.',
        data: instance
      });
    }

    // Standard approval validation for other types
    const validation = await approvalValidationService.canApprove(
      instance.requestedBy,
      req.user,
      {
        type: instance.requestType,
        amount: instance.metadata?.amount,
        duration: instance.metadata?.duration
      }
    );

    if (!validation.canApprove) {
      return res.status(403).json({
        success: false,
        message: validation.reason,
        code: validation.code
      });
    }

    // Process approval
    const updatedInstance = await approvalEngine.processApproval(
      id,
      userId,
      'approved',
      comments,
      tenantConnection
    );

    // Log the approval
    await approvalValidationService.logApprovalAttempt(
      userId,
      id,
      'approve',
      true,
      null,
      tenantConnection
    );

    res.json({
      success: true,
      message: 'Request approved successfully',
      data: updatedInstance
    });
  } catch (error) {
    console.error('Error approving request:', error);
    
    // Log failed approval attempt
    await approvalValidationService.logApprovalAttempt(
      req.user.userId,
      req.params.id,
      'approve',
      false,
      error.message,
      await getTenantConnection(req.companyId)
    );

    res.status(400).json({
      success: false,
      message: error.message || 'Failed to approve request'
    });
  }
};

/**
 * Reject a request
 */
exports.rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;
    const companyId = req.companyId;
    const userId = req.user.userId || req.user._id;

    if (!comments || comments.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const tenantConnection = await getTenantConnection(companyId);
    const ApprovalInstanceSchema = require('../models/tenant/ApprovalInstance');
    const ApprovalInstance = tenantConnection.model('ApprovalInstance', ApprovalInstanceSchema);

    // Get the approval instance
    const instance = await ApprovalInstance.findById(id);
    if (!instance) {
      return res.status(404).json({
        success: false,
        message: 'Approval request not found'
      });
    }

    // Special handling for onboarding approvals - skip standard validation
    if (instance.requestType === 'onboarding_approval') {
      // Validate that current user is the approver
      const currentApprover = instance.getCurrentApprover();
      if (!currentApprover || currentApprover.approverId.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to reject this request'
        });
      }
      
      // Process rejection for onboarding
      currentApprover.status = 'rejected';
      currentApprover.actionDate = new Date();
      currentApprover.comments = comments;
      
      instance.status = 'rejected';
      instance.slaStatus.actualCompletionDate = new Date();
      instance.history.push({
        action: 'REJECTED',
        performedBy: userId,
        timestamp: new Date(),
        details: { comments, level: instance.currentLevel }
      });
      
      await instance.save();
      
      // Update the onboarding record - put candidate on hold
      const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
      const onboarding = await Onboarding.findById(instance.requestId);
      
      if (onboarding) {
        const TenantUserSchema = require('../models/tenant/TenantUser');
        const TenantUser = tenantConnection.model('User', TenantUserSchema);
        const adminUser = await TenantUser.findById(userId).select('firstName lastName email');
        
        onboarding.status = 'approval_rejected'; // Candidate goes on hold
        onboarding.approvalStatus.status = 'rejected';
        onboarding.approvalStatus.rejectedBy = userId;
        onboarding.approvalStatus.rejectedAt = new Date();
        onboarding.approvalStatus.rejectionReason = comments;
        onboarding.approvalStatus.canReRequest = true; // Allow HR to re-request
        
        onboarding.auditTrail.push({
          action: 'approval_rejected',
          description: `Approval rejected by ${adminUser?.firstName || 'Admin'} ${adminUser?.lastName || ''}. Reason: ${comments}`,
          performedBy: userId,
          previousStatus: 'pending_approval',
          newStatus: 'approval_rejected',
          metadata: { comments, rejectionReason: comments },
          timestamp: new Date()
        });
        
        await onboarding.save();
      }
      
      return res.json({
        success: true,
        message: 'Onboarding approval rejected. Candidate is now on hold. HR can re-request approval.',
        data: instance
      });
    }

    // Standard validation for other types
    const validation = await approvalValidationService.canApprove(
      instance.requestedBy,
      req.user,
      {
        type: instance.requestType,
        amount: instance.metadata?.amount,
        duration: instance.metadata?.duration
      }
    );

    if (!validation.canApprove) {
      return res.status(403).json({
        success: false,
        message: validation.reason,
        code: validation.code
      });
    }

    // Process rejection
    const updatedInstance = await approvalEngine.processApproval(
      id,
      userId,
      'rejected',
      comments,
      tenantConnection
    );

    // Log the rejection
    await approvalValidationService.logApprovalAttempt(
      userId,
      id,
      'reject',
      true,
      null,
      tenantConnection
    );

    res.json({
      success: true,
      message: 'Request rejected',
      data: updatedInstance
    });
  } catch (error) {
    console.error('Error rejecting request:', error);
    
    // Log failed rejection attempt
    await approvalValidationService.logApprovalAttempt(
      req.user.userId,
      req.params.id,
      'reject',
      false,
      error.message,
      await getTenantConnection(req.companyId)
    );

    res.status(400).json({
      success: false,
      message: error.message || 'Failed to reject request'
    });
  }
};

/**
 * Get approval statistics
 */
exports.getApprovalStats = async (req, res) => {
  try {
    const companyId = req.companyId;
    const userId = req.user.userId || req.user._id;

    const tenantConnection = await getTenantConnection(companyId);
    const ApprovalInstanceSchema = require('../models/tenant/ApprovalInstance');
    const ApprovalInstance = tenantConnection.model('ApprovalInstance', ApprovalInstanceSchema);

    const stats = await ApprovalInstance.aggregate([
      {
        $match: {
          'approvalChain.approverId': userId
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const pending = await ApprovalInstance.countDocuments({
      'approvalChain.approverId': userId,
      'approvalChain.status': 'pending',
      status: 'pending'
    });

    const breached = await ApprovalInstance.countDocuments({
      'approvalChain.approverId': userId,
      'slaStatus.isBreached': true,
      status: 'pending'
    });

    res.json({
      success: true,
      data: {
        byStatus: stats,
        pending,
        breached
      }
    });
  } catch (error) {
    console.error('Error fetching approval stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch approval statistics',
      error: error.message
    });
  }
};
