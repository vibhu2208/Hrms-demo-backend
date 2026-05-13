const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  module: {
    type: String,
    required: true,
    enum: [
      'employees',
      'leave',
      'attendance',
      'payroll',
      'recruitment',
      'performance',
      'assets',
      'documents',
      'reports',
      'settings',
      'users',
      'approvals',
      'offboarding',
      'compliance'
    ]
  },
  action: {
    type: String,
    required: true,
    enum: ['create', 'read', 'update', 'delete', 'approve', 'export', 'manage']
  },
  description: {
    type: String,
    required: true
  },
  scope: {
    type: String,
    enum: ['own', 'team', 'department', 'all'],
    default: 'own'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

permissionSchema.index({ code: 1 });
permissionSchema.index({ module: 1, action: 1 });

const Permission = mongoose.model('Permission', permissionSchema);

module.exports = Permission;
