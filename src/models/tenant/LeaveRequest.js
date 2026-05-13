/**
 * Leave Request Model - Stored in tenant database
 */

const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  employeeEmail: {
    type: String,
    required: true,
    lowercase: true
  },
  employeeName: {
    type: String,
    required: true
  },
  leaveType: {
    type: String,
    required: true,
    enum: ['Personal Leave', 'Sick Leave', 'Casual Leave', 'Comp Offs', 'Floater Leave', 'Marriage Leave', 'Maternity Leave', 'Paternity Leave', 'Unpaid Leave']
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  numberOfDays: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending'
  },
  // Manager who needs to approve
  reportingManager: {
    type: String,
    lowercase: true
  },
  // Approval details
  approvedBy: {
    type: String
  },
  approvedByEmail: {
    type: String,
    lowercase: true
  },
  approvedOn: {
    type: Date
  },
  approvalComments: {
    type: String
  },
  // Rejection details
  rejectedBy: {
    type: String
  },
  rejectedByEmail: {
    type: String,
    lowercase: true
  },
  rejectedOn: {
    type: Date
  },
  rejectionReason: {
    type: String
  },
  // Link to approval workflow instance
  approvalInstanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ApprovalInstance'
  },
  // Link to approval workflow instance
  approvalInstanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ApprovalInstance'
  },
  // Cancellation
  cancelledOn: {
    type: Date
  },
  cancellationReason: {
    type: String
  },
  appliedOn: {
    type: Date,
    default: Date.now
  },
  // Multi-level approval fields
  workflowId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ApprovalWorkflow'
  },
  currentLevel: {
    type: Number,
    default: 1
  },
  approvalLevels: [{
    level: {
      type: Number,
      required: true
    },
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
      enum: ['pending', 'approved', 'rejected', 'delegated'],
      default: 'pending'
    },
    comments: {
      type: String
    },
    approvedAt: {
      type: Date
    },
    rejectedAt: {
      type: Date
    },
    delegatedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    delegatedToEmail: {
      type: String,
      lowercase: true
    },
    slaDeadline: {
      type: Date
    },
    isEscalated: {
      type: Boolean,
      default: false
    },
    escalatedAt: {
      type: Date
    }
  }],
  slaDeadline: {
    type: Date,
    index: true
  },
  isEscalated: {
    type: Boolean,
    default: false,
    index: true
  },
  escalatedAt: {
    type: Date
  },
  escalationReason: {
    type: String
  }
}, {
  timestamps: true
});

// Index for faster queries
leaveRequestSchema.index({ employeeEmail: 1, status: 1 });
leaveRequestSchema.index({ reportingManager: 1, status: 1 });
leaveRequestSchema.index({ startDate: 1, endDate: 1 });

module.exports = leaveRequestSchema;
