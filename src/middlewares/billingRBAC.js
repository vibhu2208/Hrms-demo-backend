const { SUPER_ADMIN_ROLES, MODULES, ACTIONS, hasPermission } = require('../config/superAdminRoles');

// Specialized billing permission checks
const billingPermissions = {
  // Subscription management permissions
  canCreateSubscription: (role) => {
    return hasPermission(role, MODULES.SUBSCRIPTION_BILLING, ACTIONS.CREATE);
  },

  canUpdateSubscription: (role) => {
    return hasPermission(role, MODULES.SUBSCRIPTION_BILLING, ACTIONS.UPDATE);
  },

  canCancelSubscription: (role) => {
    // Only Super Admin and Finance Admin can cancel subscriptions
    return [SUPER_ADMIN_ROLES.SUPER_ADMIN, SUPER_ADMIN_ROLES.FINANCE_ADMIN].includes(role);
  },

  canSuspendSubscription: (role) => {
    // Only Super Admin and Finance Admin can suspend subscriptions
    return [SUPER_ADMIN_ROLES.SUPER_ADMIN, SUPER_ADMIN_ROLES.FINANCE_ADMIN].includes(role);
  },

  // Invoice management permissions
  canGenerateInvoice: (role) => {
    return hasPermission(role, MODULES.SUBSCRIPTION_BILLING, ACTIONS.GENERATE_INVOICE);
  },

  canUpdateInvoice: (role) => {
    return hasPermission(role, MODULES.SUBSCRIPTION_BILLING, ACTIONS.UPDATE);
  },

  canMarkInvoiceAsPaid: (role) => {
    return hasPermission(role, MODULES.SUBSCRIPTION_BILLING, ACTIONS.PROCESS_PAYMENT);
  },

  canSendInvoiceReminder: (role) => {
    return hasPermission(role, MODULES.SUBSCRIPTION_BILLING, ACTIONS.SEND_REMINDER);
  },

  // Payment management permissions
  canProcessPayment: (role) => {
    return hasPermission(role, MODULES.SUBSCRIPTION_BILLING, ACTIONS.PROCESS_PAYMENT);
  },

  canProcessRefund: (role) => {
    // Only Super Admin can process refunds
    return role === SUPER_ADMIN_ROLES.SUPER_ADMIN;
  },

  canVerifyPayment: (role) => {
    return hasPermission(role, MODULES.SUBSCRIPTION_BILLING, ACTIONS.APPROVE);
  },

  canReconcilePayment: (role) => {
    return hasPermission(role, MODULES.SUBSCRIPTION_BILLING, ACTIONS.RECONCILE);
  },

  // Revenue and analytics permissions
  canViewRevenueDashboard: (role) => {
    return hasPermission(role, MODULES.SUBSCRIPTION_BILLING, ACTIONS.READ) ||
           hasPermission(role, MODULES.ANALYTICS_MONITORING, ACTIONS.READ);
  },

  canExportRevenueData: (role) => {
    return hasPermission(role, MODULES.SUBSCRIPTION_BILLING, ACTIONS.EXPORT) ||
           hasPermission(role, MODULES.ANALYTICS_MONITORING, ACTIONS.EXPORT);
  },

  // Client-specific permissions
  canViewClientBilling: (role, clientId, userClientId) => {
    // Super admins and finance admins can view all client billing
    if ([SUPER_ADMIN_ROLES.SUPER_ADMIN, SUPER_ADMIN_ROLES.FINANCE_ADMIN].includes(role)) {
      return true;
    }
    
    // System managers can view billing for clients they manage
    if (role === SUPER_ADMIN_ROLES.SYSTEM_MANAGER) {
      return hasPermission(role, MODULES.SUBSCRIPTION_BILLING, ACTIONS.READ);
    }
    
    // Compliance officers can view for audit purposes
    if (role === SUPER_ADMIN_ROLES.COMPLIANCE_OFFICER) {
      return hasPermission(role, MODULES.SUBSCRIPTION_BILLING, ACTIONS.READ);
    }
    
    return false;
  },

  // Amount-based permissions (for high-value transactions)
  canProcessHighValueTransaction: (role, amount, threshold = 10000) => {
    if (amount < threshold) return true;
    
    // High-value transactions require Super Admin or Finance Admin approval
    return [SUPER_ADMIN_ROLES.SUPER_ADMIN, SUPER_ADMIN_ROLES.FINANCE_ADMIN].includes(role);
  }
};

// Middleware functions
const requireBillingPermission = (permissionCheck) => {
  return (req, res, next) => {
    const userRole = req.user?.role;
    
    if (!userRole) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // SUPER ADMIN BYPASS - Give Super Admin full access to everything
    if (userRole === SUPER_ADMIN_ROLES.SUPER_ADMIN || userRole === 'super_admin') {
      return next();
    }

    const hasRequiredPermission = typeof permissionCheck === 'function' 
      ? permissionCheck(userRole, req) 
      : billingPermissions[permissionCheck]?.(userRole);

    if (!hasRequiredPermission) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions for this billing operation'
      });
    }

    next();
  };
};

// Specific middleware for common billing operations
const canCreateSubscription = requireBillingPermission('canCreateSubscription');
const canUpdateSubscription = requireBillingPermission('canUpdateSubscription');
const canCancelSubscription = requireBillingPermission('canCancelSubscription');
const canSuspendSubscription = requireBillingPermission('canSuspendSubscription');

const canGenerateInvoice = requireBillingPermission('canGenerateInvoice');
const canUpdateInvoice = requireBillingPermission('canUpdateInvoice');
const canMarkInvoiceAsPaid = requireBillingPermission('canMarkInvoiceAsPaid');
const canSendInvoiceReminder = requireBillingPermission('canSendInvoiceReminder');

const canProcessPayment = requireBillingPermission('canProcessPayment');
const canProcessRefund = requireBillingPermission('canProcessRefund');
const canVerifyPayment = requireBillingPermission('canVerifyPayment');
const canReconcilePayment = requireBillingPermission('canReconcilePayment');

const canViewRevenueDashboard = requireBillingPermission('canViewRevenueDashboard');
const canExportRevenueData = requireBillingPermission('canExportRevenueData');

// High-value transaction middleware
const requireHighValueApproval = (threshold = 10000) => {
  return (req, res, next) => {
    const userRole = req.user?.role;
    const amount = req.body?.amount || req.body?.total || 0;
    
    // SUPER ADMIN BYPASS - Allow all transactions
    if (userRole === SUPER_ADMIN_ROLES.SUPER_ADMIN || userRole === 'super_admin') {
      return next();
    }
    
    if (!billingPermissions.canProcessHighValueTransaction(userRole, amount, threshold)) {
      return res.status(403).json({
        success: false,
        message: `Transactions over ${threshold} require Super Admin or Finance Admin approval`
      });
    }
    
    next();
  };
};

// Client billing access middleware
const requireClientBillingAccess = (req, res, next) => {
  const userRole = req.user?.role;
  const clientId = req.params?.clientId || req.body?.clientId;
  const userClientId = req.user?.clientId;
  
  // SUPER ADMIN BYPASS - Allow access to all client billing
  if (userRole === SUPER_ADMIN_ROLES.SUPER_ADMIN || userRole === 'super_admin') {
    return next();
  }
  
  if (!billingPermissions.canViewClientBilling(userRole, clientId, userClientId)) {
    return res.status(403).json({
      success: false,
      message: 'Insufficient permissions to access this client\'s billing information'
    });
  }
  
  next();
};

// Audit logging for sensitive billing operations
const auditBillingOperation = (operation) => {
  return (req, res, next) => {
    // Skip audit logging if Super Admin bypass is active
    if (req.superAdminBypass || req.forcedBypass) {
      return next();
    }
    
    // Store operation details for audit logging
    req.billingAudit = {
      operation,
      timestamp: new Date(),
      userRole: req.user?.role,
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    };
    
    next();
  };
};

module.exports = {
  billingPermissions,
  requireBillingPermission,
  
  // Subscription permissions
  canCreateSubscription,
  canUpdateSubscription,
  canCancelSubscription,
  canSuspendSubscription,
  
  // Invoice permissions
  canGenerateInvoice,
  canUpdateInvoice,
  canMarkInvoiceAsPaid,
  canSendInvoiceReminder,
  
  // Payment permissions
  canProcessPayment,
  canProcessRefund,
  canVerifyPayment,
  canReconcilePayment,
  
  // Revenue permissions
  canViewRevenueDashboard,
  canExportRevenueData,
  
  // Special permissions
  requireHighValueApproval,
  requireClientBillingAccess,
  auditBillingOperation
};
