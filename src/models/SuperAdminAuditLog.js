// Super Admin Audit Log Model
// Phase 7: Enhanced audit logging for Super Admin operations

const mongoose = require('mongoose');

const superAdminAuditLogSchema = new mongoose.Schema({
  // User who performed the action
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // User's internal role at the time of action
  userInternalRole: {
    type: String,
    enum: ['super_admin', 'system_manager', 'finance_admin', 'compliance_officer', 'tech_admin', 'viewer'],
    required: true
  },
  
  // Action performed
  action: {
    type: String,
    required: true,
    enum: [
      // Generic CRUD operations
      'CREATE', 'READ', 'UPDATE', 'DELETE',
      
      // CRUD operations
      'CREATE_CLIENT', 'UPDATE_CLIENT', 'DELETE_CLIENT', 'UPDATE_CLIENT_STATUS', 'UPDATE_CLIENT_SUBSCRIPTION',
      'CREATE_PACKAGE', 'UPDATE_PACKAGE', 'DELETE_PACKAGE', 'UPDATE_PACKAGE_STATUS', 'TOGGLE_PACKAGE_STATUS',
      'CREATE_BILLING', 'UPDATE_BILLING', 'DELETE_BILLING', 'APPROVE_BILLING',
      'CREATE_COMPLIANCE_RECORD', 'UPDATE_COMPLIANCE_RECORD', 'DELETE_COMPLIANCE_RECORD', 'APPROVE_COMPLIANCE',
      'UPDATE_SYSTEM_CONFIG', 'CONFIGURE_SYSTEM',
      'CREATE_DATA_BACKUP', 'RESTORE_DATA', 'DELETE_DATA',
      'CREATE_REPORT', 'EXPORT_REPORT', 'EXPORT_DATA',
      
      // Package Management operations
      'ASSIGN_PACKAGE', 'UPDATE_CLIENT_PACKAGE', 'CANCEL_CLIENT_PACKAGE', 'CANCEL_PACKAGE',
      'CUSTOMIZE_MODULES', 'CUSTOMIZE_CLIENT_MODULES', 'UPDATE_MODULE_OVERRIDE',
      
      // Role management
      'CREATE_SUPER_ADMIN_USER', 'UPDATE_SUPER_ADMIN_USER', 'DELETE_SUPER_ADMIN_USER', 'UPDATE_USER_ROLE',
      'DEACTIVATE_SUPER_ADMIN_USER',
      
      // Security and access
      'LOGIN', 'LOGOUT', 'FAILED_LOGIN', 'PASSWORD_CHANGE', 'PASSWORD_RESET',
      'UNAUTHORIZED_ACCESS_ATTEMPT', 'UNAUTHORIZED_ROUTE_ACCESS', 'UNAUTHORIZED_MODULE_ACCESS', 'INSUFFICIENT_ROLE_LEVEL',
      'ROUTE_ACCESS', 'MODULE_ACCESS',
      
      // System operations
      'SYSTEM_HEALTH_CHECK', 'DASHBOARD_ACCESS', 'ANALYTICS_ACCESS', 'MONITORING_ACCESS',
      'EXPORT_AUDIT_LOGS',
      
      // Data operations
      'DATA_EXPORT', 'DATA_IMPORT', 'BULK_OPERATION', 'SEED_BILLING_DATA',
      
      // Subscription operations
      'CREATE_SUBSCRIPTION', 'UPDATE_SUBSCRIPTION', 'RENEW_SUBSCRIPTION', 'CANCEL_SUBSCRIPTION', 'SUSPEND_SUBSCRIPTION', 'REACTIVATE_SUBSCRIPTION',
      
      // Invoice operations
      'GENERATE_INVOICE', 'UPDATE_INVOICE', 'MARK_INVOICE_PAID', 'SEND_INVOICE_REMINDER', 'CANCEL_INVOICE',
      
      // Payment operations
      'PROCESS_PAYMENT', 'REFUND_PAYMENT', 'VERIFY_PAYMENT', 'RECONCILE_PAYMENT'
    ]
  },
  
  // Module where action was performed
  module: {
    type: String,
    enum: [
      'client_management', 'package_management', 'subscription_billing', 'compliance_legal',
      'system_config', 'data_management', 'analytics_monitoring', 'reports_center',
      'role_management', 'audit_logs', 'authentication', 'dashboard'
    ],
    required: true
  },
  
  // Resource type affected
  resourceType: {
    type: String,
    enum: ['Client', 'Package', 'User', 'Subscription', 'Invoice', 'Payment', 'Billing', 'Compliance', 'Config', 'Report', 'Data', 'System', 'ClientPackage', 'ClientModuleOverride', 'Module'],
    required: true
  },
  
  // Resource ID (if applicable)
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'resourceType'
  },
  
  // Client ID (if action affects a specific client)
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  },
  
  // Detailed information about the action
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Request metadata
  requestMetadata: {
    ip: String,
    userAgent: String,
    route: String,
    method: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  
  // Result of the action
  result: {
    type: String,
    enum: ['success', 'failure', 'partial', 'unauthorized'],
    default: 'success'
  },
  
  // Error message (if action failed)
  errorMessage: String,
  
  // Severity level
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  
  // Tags for categorization and filtering
  tags: [{
    type: String
  }],
  
  // Session ID for tracking user sessions
  sessionId: String,
  
  // Compliance flags
  compliance: {
    gdprRelevant: {
      type: Boolean,
      default: false
    },
    dataProcessing: {
      type: Boolean,
      default: false
    },
    sensitiveData: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true,
  // Add indexes for better query performance
  index: [
    { userId: 1, createdAt: -1 },
    { action: 1, createdAt: -1 },
    { module: 1, createdAt: -1 },
    { clientId: 1, createdAt: -1 },
    { userInternalRole: 1, createdAt: -1 },
    { severity: 1, createdAt: -1 },
    { result: 1, createdAt: -1 }
  ]
});

// Pre-save middleware to set default values and validation
superAdminAuditLogSchema.pre('save', function(next) {
  // Set severity based on action type
  if (!this.severity) {
    if (this.action.includes('DELETE') || this.action.includes('UNAUTHORIZED')) {
      this.severity = 'high';
    } else if (this.action.includes('CREATE') || this.action.includes('UPDATE')) {
      this.severity = 'medium';
    } else {
      this.severity = 'low';
    }
  }
  
  // Set compliance flags based on action and module
  if (this.module === 'client_management' || this.module === 'compliance_legal') {
    this.compliance.gdprRelevant = true;
    this.compliance.dataProcessing = true;
  }
  
  if (this.action.includes('DELETE') || this.action.includes('EXPORT')) {
    this.compliance.sensitiveData = true;
  }
  
  next();
});

// Static methods for common queries
superAdminAuditLogSchema.statics.getRecentActivities = function(limit = 50) {
  return this.find()
    .populate('userId', 'email internalRole')
    .populate('clientId', 'name companyName')
    .sort({ createdAt: -1 })
    .limit(limit);
};

superAdminAuditLogSchema.statics.getActivitiesByUser = function(userId, limit = 100) {
  return this.find({ userId })
    .populate('clientId', 'name companyName')
    .sort({ createdAt: -1 })
    .limit(limit);
};

superAdminAuditLogSchema.statics.getActivitiesByModule = function(module, limit = 100) {
  return this.find({ module })
    .populate('userId', 'email internalRole')
    .populate('clientId', 'name companyName')
    .sort({ createdAt: -1 })
    .limit(limit);
};

superAdminAuditLogSchema.statics.getSecurityEvents = function(limit = 100) {
  return this.find({
    $or: [
      { action: { $regex: 'UNAUTHORIZED' } },
      { action: { $regex: 'FAILED' } },
      { severity: 'critical' },
      { severity: 'high' }
    ]
  })
    .populate('userId', 'email internalRole')
    .sort({ createdAt: -1 })
    .limit(limit);
};

superAdminAuditLogSchema.statics.getComplianceRelevantLogs = function(startDate, endDate) {
  const query = {
    'compliance.gdprRelevant': true,
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  };
  
  return this.find(query)
    .populate('userId', 'email internalRole')
    .populate('clientId', 'name companyName')
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model('SuperAdminAuditLog', superAdminAuditLogSchema);
