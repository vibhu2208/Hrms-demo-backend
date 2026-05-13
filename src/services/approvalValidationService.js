/**
 * Approval Validation Service
 * Centralized service to validate approval requests and prevent conflicts of interest
 */

class ApprovalValidationService {
  /**
   * Validate if user can approve a request
   * @param {String} requesterId - ID of person who made the request
   * @param {String} approverId - ID of person trying to approve
   * @param {String} requestType - Type of request (leave, expense, attendance, etc.)
   * @returns {Object} { valid: Boolean, reason: String }
   */
  validateApprover(requesterId, approverId, requestType) {
    // Self-approval check
    if (requesterId.toString() === approverId.toString()) {
      return {
        valid: false,
        reason: `You cannot approve your own ${requestType} request`,
        code: 'SELF_APPROVAL_FORBIDDEN'
      };
    }

    return { valid: true };
  }

  /**
   * Check for conflict of interest in approval
   * @param {Object} approver - Approver user object
   * @param {Object} requestData - Request data
   * @returns {Object} { hasConflict: Boolean, reason: String }
   */
  checkConflictOfInterest(approver, requestData) {
    // Example: Check if approver is related to requester
    // This can be extended based on business rules
    
    // Check if approver is on leave during approval period
    if (requestData.type === 'leave' && approver.onLeave) {
      return {
        hasConflict: true,
        reason: 'Approver is currently on leave',
        code: 'APPROVER_ON_LEAVE'
      };
    }

    // Check if approver is inactive
    if (!approver.isActive) {
      return {
        hasConflict: true,
        reason: 'Approver account is inactive',
        code: 'APPROVER_INACTIVE'
      };
    }

    return { hasConflict: false };
  }

  /**
   * Validate approval authority
   * @param {Object} approver - Approver user object
   * @param {Object} requestData - Request data
   * @returns {Object} { authorized: Boolean, reason: String }
   */
  validateApprovalAuthority(approver, requestData) {
    const { type, amount, duration, level } = requestData;

    // Example: Check if approver has authority for the request amount/duration
    if (type === 'expense') {
      const approvalLimits = {
        'employee': 0,
        'manager': 25000,
        'hr': 50000,
        'company_admin': Infinity
      };

      const limit = approvalLimits[approver.role] || 0;
      
      if (amount > limit) {
        return {
          authorized: false,
          reason: `Approval amount exceeds your limit of ₹${limit}`,
          code: 'INSUFFICIENT_APPROVAL_AUTHORITY'
        };
      }
    }

    if (type === 'leave') {
      // Managers can approve up to 7 days, HR can approve more
      if (approver.role === 'manager' && duration > 7) {
        return {
          authorized: false,
          reason: 'Leaves longer than 7 days require HR approval',
          code: 'INSUFFICIENT_APPROVAL_AUTHORITY'
        };
      }
    }

    return { authorized: true };
  }

  /**
   * Comprehensive approval validation
   * @param {String} requesterId - ID of requester
   * @param {Object} approver - Approver user object
   * @param {Object} requestData - Request data
   * @returns {Object} { canApprove: Boolean, reason: String, code: String }
   */
  async canApprove(requesterId, approver, requestData) {
    // Check self-approval
    const approverValidation = this.validateApprover(
      requesterId, 
      approver._id, 
      requestData.type
    );
    
    if (!approverValidation.valid) {
      return {
        canApprove: false,
        reason: approverValidation.reason,
        code: approverValidation.code
      };
    }

    // Check conflict of interest
    const conflictCheck = this.checkConflictOfInterest(approver, requestData);
    
    if (conflictCheck.hasConflict) {
      return {
        canApprove: false,
        reason: conflictCheck.reason,
        code: conflictCheck.code
      };
    }

    // Check approval authority
    const authorityCheck = this.validateApprovalAuthority(approver, requestData);
    
    if (!authorityCheck.authorized) {
      return {
        canApprove: false,
        reason: authorityCheck.reason,
        code: authorityCheck.code
      };
    }

    return { canApprove: true };
  }

  /**
   * Log approval attempt for audit
   * @param {String} approverId - ID of approver
   * @param {String} requestId - ID of request
   * @param {String} action - approve/reject
   * @param {Boolean} success - Whether approval succeeded
   * @param {String} reason - Reason if failed
   */
  async logApprovalAttempt(approverId, requestId, action, success, reason = null, tenantConnection = null) {
    const AuditLog = tenantConnection ? 
      tenantConnection.model('AuditLog') : 
      require('../models/AuditLog');

    await AuditLog.create({
      userId: approverId,
      action: 'APPROVAL_PROCESSED',
      resource: 'Approval',
      resourceId: requestId,
      details: {
        action,
        success,
        failureReason: reason
      },
      status: success ? 'success' : 'failed',
      errorMessage: reason,
      category: 'data_modification',
      riskLevel: success ? 'low' : 'medium'
    });
  }
}

module.exports = new ApprovalValidationService();
