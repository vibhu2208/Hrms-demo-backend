/**
 * Leave Encashment Request Model - Stored in tenant database
 * Tracks leave encashment requests with approval workflow
 */

const mongoose = require('mongoose');

const leaveEncashmentRequestSchema = new mongoose.Schema({
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
  employeeName: {
    type: String,
    required: true
  },
  leaveType: {
    type: String,
    required: [true, 'Leave type is required'],
    enum: ['Personal Leave', 'Sick Leave', 'Casual Leave', 'Comp Offs', 'Floater Leave', 'Marriage Leave', 'Maternity Leave', 'Paternity Leave', 'Unpaid Leave']
  },
  numberOfDays: {
    type: Number,
    required: [true, 'Number of days is required'],
    min: 0.5 // Allow half days
  },
  ratePerDay: {
    type: Number,
    required: true,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  reason: {
    type: String,
    required: [true, 'Reason is required'],
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled', 'processed'],
    default: 'pending',
    index: true
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
    slaDeadline: {
      type: Date
    }
  }],
  slaDeadline: {
    type: Date,
    index: true
  },
  // Leave balance at time of request
  leaveBalanceAtRequest: {
    total: Number,
    available: Number,
    consumed: Number
  },
  // Payroll integration
  payrollProcessed: {
    type: Boolean,
    default: false,
    index: true
  },
  payrollReference: {
    type: String,
    trim: true
  },
  payrollProcessedAt: {
    type: Date
  },
  payrollProcessedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Rejection details
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
  // Cancellation
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledAt: {
    type: Date
  },
  cancellationReason: {
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
leaveEncashmentRequestSchema.index({ employeeId: 1, status: 1 });
leaveEncashmentRequestSchema.index({ status: 1, slaDeadline: 1 });
leaveEncashmentRequestSchema.index({ payrollProcessed: 1 });

module.exports = leaveEncashmentRequestSchema;


