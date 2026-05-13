const { 
  hasPermission, 
  canAccessOffboardingRequest, 
  canPerformAction,
  OFFBOARDING_PERMISSIONS 
} = require('../config/tenantPermissions');

/**
 * Offboarding RBAC Middleware
 * Phase 3: Role & Permission Integration
 */

/**
 * Check if user has specific offboarding permission
 */
const requireOffboardingPermission = (permission) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      const userRole = user.role;
      const userDepartment = user.department;

      if (!hasPermission(userRole, permission, userDepartment)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required permission: ${permission}`,
          details: {
            userRole,
            userDepartment,
            requiredPermission: permission
          }
        });
      }

      // Add permission info to request
      req.offboardingPermission = {
        permission,
        userRole,
        userDepartment
      };

      next();
    } catch (error) {
      console.error('Offboarding RBAC Error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during permission check'
      });
    }
  };
};

/**
 * Check if user can access specific offboarding request
 */
const requireOffboardingAccess = async (req, res, next) => {
  try {
    const user = req.user;
    const offboardingRequestId = req.params.id || req.params.offboardingId;

    if (!offboardingRequestId) {
      return res.status(400).json({
        success: false,
        message: 'Offboarding request ID is required'
      });
    }

    // Get offboarding request from tenant database
    const getTenantModel = (connection, modelName, schema) => {
      return connection.model(modelName, schema);
    };
    const offboardingRequestSchema = require('../models/tenant/OffboardingRequest');
    const OffboardingRequest = getTenantModel(req.tenant.connection, 'OffboardingRequest', offboardingRequestSchema);
    
    const offboardingRequest = await OffboardingRequest.findById(offboardingRequestId);
    
    if (!offboardingRequest) {
      return res.status(404).json({
        success: false,
        message: 'Offboarding request not found'
      });
    }

    // Check access permissions
    if (!canAccessOffboardingRequest(user.role, user._id, offboardingRequest, user.department)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have permission to access this offboarding request.',
        details: {
          userRole: user.role,
          userId: user._id,
          offboardingRequestId
        }
      });
    }

    // Add offboarding request to request object
    req.offboardingRequest = offboardingRequest;
    next();
  } catch (error) {
    console.error('Offboarding Access Check Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during access check'
    });
  }
};

/**
 * Check if user can perform specific action on offboarding request
 */
const requireOffboardingAction = (action) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      const offboardingRequest = req.offboardingRequest;

      if (!offboardingRequest) {
        return res.status(400).json({
          success: false,
          message: 'Offboarding request not found in request context'
        });
      }

      if (!canPerformAction(user.role, action, offboardingRequest, user._id, user.department)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Cannot perform action: ${action}`,
          details: {
            userRole: user.role,
            action,
            offboardingStatus: offboardingRequest.status,
            offboardingStage: offboardingRequest.currentStage
          }
        });
      }

      req.offboardingAction = action;
      next();
    } catch (error) {
      console.error('Offboarding Action Check Error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during action check'
      });
    }
  };
};

/**
 * Check if user can initiate offboarding for specific employee
 */
const canInitiateOffboarding = async (req, res, next) => {
  try {
    const user = req.user;
    const { employeeId } = req.body;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID is required'
      });
    }

    // Get employee details
    const getTenantModel = (connection, modelName, schema) => {
      return connection.model(modelName, schema);
    };
    const Employee = getTenantModel(req.tenant.connection, 'Employee', require('../models/Employee').schema);
    const employee = await Employee.findById(employeeId);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Check initiation permissions
    const userRole = user.role;
    let canInitiate = false;

    // Self-initiation
    if (employee.userId && employee.userId.toString() === user._id.toString()) {
      canInitiate = hasPermission(userRole, OFFBOARDING_PERMISSIONS.OFFBOARDING_INITIATE_SELF);
    }
    // Team member initiation (for managers)
    else if (employee.reportingManager && employee.reportingManager.toString() === user._id.toString()) {
      canInitiate = hasPermission(userRole, OFFBOARDING_PERMISSIONS.OFFBOARDING_INITIATE_TEAM);
    }
    // Any employee initiation (for HR/Admin)
    else {
      canInitiate = hasPermission(userRole, OFFBOARDING_PERMISSIONS.OFFBOARDING_INITIATE_ANY);
    }

    if (!canInitiate) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have permission to initiate offboarding for this employee.',
        details: {
          userRole,
          employeeId,
          isManager: employee.reportingManager && employee.reportingManager.toString() === user._id.toString(),
          isSelf: employee.userId && employee.userId.toString() === user._id.toString()
        }
      });
    }

    req.targetEmployee = employee;
    next();
  } catch (error) {
    console.error('Offboarding Initiation Check Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during initiation check'
    });
  }
};

/**
 * Check if user can approve offboarding at current stage
 */
const canApproveOffboarding = async (req, res, next) => {
  try {
    const user = req.user;
    const offboardingRequest = req.offboardingRequest;

    if (!offboardingRequest) {
      return res.status(400).json({
        success: false,
        message: 'Offboarding request not found in request context'
      });
    }

    const currentStage = offboardingRequest.currentStage;
    const userRole = user.role;
    let canApprove = false;

    // Check approval permissions based on current stage
    switch (currentStage) {
      case 'manager_approval':
        // Check if user is the reporting manager
        const getTenantModel = (connection, modelName, schema) => {
          return connection.model(modelName, schema);
        };
        const Employee = getTenantModel(req.tenant.connection, 'Employee', require('../models/Employee').schema);
        const employee = await Employee.findById(offboardingRequest.employeeId);
        
        if (employee.reportingManager && employee.reportingManager.toString() === user._id.toString()) {
          canApprove = hasPermission(userRole, OFFBOARDING_PERMISSIONS.OFFBOARDING_APPROVE_MANAGER);
        }
        break;

      case 'hr_approval':
        canApprove = hasPermission(userRole, OFFBOARDING_PERMISSIONS.OFFBOARDING_APPROVE_HR);
        break;

      case 'finance_approval':
        canApprove = hasPermission(userRole, OFFBOARDING_PERMISSIONS.OFFBOARDING_APPROVE_FINANCE);
        break;

      default:
        canApprove = hasPermission(userRole, OFFBOARDING_PERMISSIONS.OFFBOARDING_APPROVE_FINAL);
    }

    if (!canApprove) {
      return res.status(403).json({
        success: false,
        message: `Access denied. You do not have permission to approve at stage: ${currentStage}`,
        details: {
          userRole,
          currentStage,
          offboardingRequestId: offboardingRequest._id
        }
      });
    }

    next();
  } catch (error) {
    console.error('Offboarding Approval Check Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during approval check'
    });
  }
};

/**
 * Check department-specific clearance permissions
 */
const requireDepartmentClearance = (department) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      const userRole = user.role;
      const userDepartment = user.department;

      // Map department to permission
      const departmentPermissionMap = {
        'hr': OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_HR,
        'it': OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_IT,
        'finance': OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_FINANCE,
        'admin': OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_ADMIN,
        'security': OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_SECURITY
      };

      const requiredPermission = departmentPermissionMap[department];
      
      if (!requiredPermission) {
        return res.status(400).json({
          success: false,
          message: `Invalid department: ${department}`
        });
      }

      // Check if user has the required permission
      if (!hasPermission(userRole, requiredPermission, userDepartment)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. You do not have ${department} clearance permission.`,
          details: {
            userRole,
            userDepartment,
            requiredDepartment: department,
            requiredPermission
          }
        });
      }

      req.clearanceDepartment = department;
      next();
    } catch (error) {
      console.error('Department Clearance Check Error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during department clearance check'
      });
    }
  };
};

/**
 * Middleware combinations for common use cases
 */
const offboardingMiddleware = {
  // View offboarding requests
  viewOffboarding: [
    requireOffboardingPermission(OFFBOARDING_PERMISSIONS.OFFBOARDING_VIEW_ALL)
  ],

  // View specific offboarding request
  viewOffboardingRequest: [
    requireOffboardingAccess
  ],

  // Initiate offboarding
  initiateOffboarding: [
    canInitiateOffboarding
  ],

  // Manage offboarding
  manageOffboarding: [
    requireOffboardingAccess,
    requireOffboardingPermission(OFFBOARDING_PERMISSIONS.OFFBOARDING_MANAGE)
  ],

  // Approve offboarding
  approveOffboarding: [
    requireOffboardingAccess,
    canApproveOffboarding
  ],

  // Close offboarding
  closeOffboarding: [
    requireOffboardingAccess,
    requireOffboardingPermission(OFFBOARDING_PERMISSIONS.OFFBOARDING_CLOSE)
  ],

  // Manage tasks
  manageTasks: [
    requireOffboardingAccess,
    requireOffboardingPermission(OFFBOARDING_PERMISSIONS.OFFBOARDING_TASK_MANAGE)
  ],

  // Complete tasks
  completeTasks: [
    requireOffboardingAccess,
    requireOffboardingPermission(OFFBOARDING_PERMISSIONS.OFFBOARDING_TASK_COMPLETE)
  ],

  // Manage assets
  manageAssets: [
    requireOffboardingAccess,
    requireOffboardingPermission(OFFBOARDING_PERMISSIONS.OFFBOARDING_ASSET_MANAGE)
  ],

  // Manage settlement
  manageSettlement: [
    requireOffboardingAccess,
    requireOffboardingPermission(OFFBOARDING_PERMISSIONS.OFFBOARDING_SETTLEMENT_APPROVE)
  ],

  // View reports
  viewReports: [
    requireOffboardingPermission(OFFBOARDING_PERMISSIONS.OFFBOARDING_REPORTS_VIEW)
  ],

  // Export reports
  exportReports: [
    requireOffboardingPermission(OFFBOARDING_PERMISSIONS.OFFBOARDING_REPORTS_EXPORT)
  ]
};

module.exports = {
  requireOffboardingPermission,
  requireOffboardingAccess,
  requireOffboardingAction,
  canInitiateOffboarding,
  canApproveOffboarding,
  requireDepartmentClearance,
  offboardingMiddleware
};
