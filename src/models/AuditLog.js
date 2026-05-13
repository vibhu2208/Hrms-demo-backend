const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  },
  action: {
    type: String,
    required: true,
    enum: [
      'create', 'update', 'delete', 'login', 'logout', 'password_change',
      'role_change', 'status_change', 'module_enable', 'module_disable',
      'subscription_create', 'subscription_update', 'subscription_cancel',
      'client_create', 'client_update', 'client_suspend', 'client_activate',
      'package_create', 'package_update', 'package_delete',
      'config_update', 'data_export', 'data_import',
      'PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'SALARY_VIEWED', 'SALARY_MODIFIED',
      'ATTENDANCE_MODIFIED', 'PAYROLL_ACCESSED', 'APPROVAL_PROCESSED', 'ACCESS_REVOKED'
    ]
  },
  resource: {
    type: String,
    required: true // e.g., 'user', 'client', 'package', 'subscription'
  },
  resourceId: {
    type: String // ID of the affected resource
  },
  details: {
    type: mongoose.Schema.Types.Mixed // Store additional details about the action
  },
  beforeValue: {
    type: mongoose.Schema.Types.Mixed // Value before change (encrypted if sensitive)
  },
  afterValue: {
    type: mongoose.Schema.Types.Mixed // Value after change (encrypted if sensitive)
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  deviceFingerprint: {
    type: String
  },
  geolocation: {
    latitude: Number,
    longitude: Number,
    city: String,
    country: String
  },
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },
  category: {
    type: String,
    enum: ['auth', 'data_access', 'data_modification', 'permission_change', 'payroll', 'attendance', 'system'],
    default: 'system'
  },
  status: {
    type: String,
    enum: ['success', 'failed'],
    default: 'success'
  },
  errorMessage: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes for better query performance
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ clientId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
