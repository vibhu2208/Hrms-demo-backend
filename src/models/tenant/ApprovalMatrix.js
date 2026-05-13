/**
 * Approval Matrix Model - Stored in tenant database
 * Defines approval requirements based on leave type, amount, and other conditions
 */

const mongoose = require('mongoose');

const approvalMatrixSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Matrix name is required'],
    trim: true
  },
  entityType: {
    type: String,
    required: true,
    enum: ['leave', 'roster_change', 'profile_update', 'attendance_regularization', 'expense'],
    index: true
  },
  conditions: {
    leaveType: [String],
    amountRange: {
      min: Number,
      max: Number
    },
    numberOfDaysRange: {
      min: Number,
      max: Number
    },
    department: [mongoose.Schema.Types.ObjectId],
    designation: [String],
    location: [String]
  },
  requiredApprovers: [{
    level: {
      type: Number,
      required: true,
      min: 1
    },
    approverType: {
      type: String,
      enum: ['reporting_manager', 'department_head', 'hr', 'admin', 'specific_user', 'role_based'],
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
    slaMinutes: {
      type: Number,
      default: 1440
    }
  }],
  priority: {
    type: Number,
    default: 0 // Higher priority = checked first
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

// Indexes
approvalMatrixSchema.index({ entityType: 1, isActive: 1 });
approvalMatrixSchema.index({ priority: -1 });

module.exports = approvalMatrixSchema;


