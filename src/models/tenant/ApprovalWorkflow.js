/**
 * Approval Workflow Model - Stored in tenant database
 * Defines multi-level approval workflows for different entities
 */

const mongoose = require('mongoose');

const approvalWorkflowSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Workflow name is required'],
    trim: true
  },
  workflowName: {
    type: String,
    trim: true
  },
  requestType: {
    type: String,
    required: [true, 'Request type is required'],
    enum: ['leave', 'attendance', 'expense', 'payroll', 'asset', 'document', 'offboarding', 'onboarding_approval', 'roster_change', 'profile_update', 'attendance_regularization', 'other'],
    index: true
  },
  entityType: {
    type: String,
    enum: ['leave', 'roster_change', 'profile_update', 'attendance_regularization', 'expense', 'other']
  },
  description: {
    type: String,
    trim: true
  },
  priority: {
    type: Number,
    default: 0
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  approvalSteps: [{
    level: {
      type: Number,
      required: true,
      min: 1
    },
    approverType: {
      type: String,
      enum: ['manager', 'reporting_manager', 'department_head', 'hr', 'finance', 'ceo', 'company_admin', 'admin', 'specific_user', 'role_based', 'custom'],
      required: true
    },
    approverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approverRole: {
      type: String
    },
    approverEmail: {
      type: String,
      lowercase: true
    },
    isRequired: {
      type: Boolean,
      default: true
    },
    canDelegate: {
      type: Boolean,
      default: true
    },
    slaHours: {
      type: Number,
      default: 24
    },
    slaMinutes: {
      type: Number,
      default: 1440
    },
    escalationHours: {
      type: Number,
      default: 36
    }
  }],
  levels: [{
    level: Number,
    approverType: String,
    approverId: mongoose.Schema.Types.ObjectId,
    approverRole: String,
    approverEmail: String,
    isRequired: Boolean,
    canDelegate: Boolean,
    slaMinutes: Number
  }],
  slaMinutes: {
    type: Number,
    default: 2880 // 48 hours total default
  },
  escalationRules: {
    enabled: {
      type: Boolean,
      default: true
    },
    escalationAfterMinutes: {
      type: Number,
      default: 1440 // Escalate after 24 hours
    },
    escalateTo: {
      type: String,
      enum: ['next_level', 'hr', 'admin', 'specific_user'],
      default: 'next_level'
    },
    escalateToEmail: {
      type: String,
      lowercase: true
    },
    autoApproveAfterMinutes: {
      type: Number // Auto-approve if no response after X minutes (optional)
    }
  },
  conditions: [{
    field: {
      type: String,
      required: true
    },
    operator: {
      type: String,
      enum: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'in', 'not_in', 'contains', 'not_contains'],
      required: true
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    }
  }],
  legacyConditions: {
    leaveType: [String],
    amountRange: {
      min: Number,
      max: Number
    },
    department: [mongoose.Schema.Types.ObjectId],
    designation: [String],
    duration: {
      min: Number,
      max: Number
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
approvalWorkflowSchema.index({ entityType: 1, isActive: 1 });
approvalWorkflowSchema.index({ isDefault: 1, entityType: 1 });

module.exports = approvalWorkflowSchema;


