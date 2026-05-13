/**
 * Profile Update Request Model - Stored in tenant database
 * Tracks profile change requests with approval workflow
 */

const mongoose = require('mongoose');

const profileUpdateRequestSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Employee ID is required'],
    index: true
  },
  employeeEmail: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  fieldName: {
    type: String,
    required: [true, 'Field name is required'],
    trim: true
  },
  fieldCategory: {
    type: String,
    enum: ['personal', 'address', 'contact', 'family', 'education', 'experience', 'certification', 'other'],
    required: true
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed,
    required: [true, 'New value is required']
  },
  reason: {
    type: String,
    required: [true, 'Reason is required'],
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
    index: true
  },
  approvals: [{
    approverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approverEmail: {
      type: String,
      lowercase: true
    },
    approverName: {
      type: String
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected']
    },
    comments: {
      type: String
    },
    approvedAt: {
      type: Date
    },
    rejectedAt: {
      type: Date
    }
  }],
  currentApprover: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  slaDeadline: {
    type: Date,
    index: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: {
    type: Date
  },
  rejectionReason: {
    type: String
  },
  appliedOn: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
profileUpdateRequestSchema.index({ employeeId: 1, status: 1 });
profileUpdateRequestSchema.index({ status: 1, slaDeadline: 1 });

module.exports = profileUpdateRequestSchema;


