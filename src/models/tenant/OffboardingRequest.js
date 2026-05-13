const mongoose = require('mongoose');

/**
 * Offboarding Request Model - Main workflow record
 * Phase 1: Module Setup & Data Model
 */
const offboardingRequestSchema = new mongoose.Schema({
  // Basic Information
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true
  },
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Offboarding Details
  reason: {
    type: String,
    enum: [
      'voluntary_resignation',
      'involuntary_termination',
      'retirement',
      'contract_end',
      'layoff',
      'performance_issues',
      'misconduct',
      'mutual_agreement',
      'other'
    ],
    required: true
  },
  reasonDetails: {
    type: String,
    maxlength: 1000
  },
  lastWorkingDay: {
    type: Date,
    required: true,
    index: true
  },
  noticePeriod: {
    given: {
      type: Number, // days
      default: 0
    },
    required: {
      type: Number, // days
      default: 30
    },
    waived: {
      type: Boolean,
      default: false
    },
    waivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    waivedReason: String
  },

  // Workflow Status
  status: {
    type: String,
    enum: [
      'draft',
      'initiated',
      'approvals_pending',
      'checklist_active',
      'clearance_in_progress',
      'settlement_pending',
      'feedback_pending',
      'closed',
      'cancelled'
    ],
    default: 'draft',
    index: true
  },
  
  // Workflow Stages
  currentStage: {
    type: String,
    enum: [
      'initiation',
      'manager_approval',
      'hr_approval',
      'finance_approval',
      'checklist_generation',
      'departmental_clearance',
      'asset_return',
      'knowledge_transfer',
      'final_settlement',
      'exit_interview',
      'closure'
    ],
    default: 'initiation'
  },

  // Approval Chain
  approvals: [{
    stage: {
      type: String,
      enum: ['manager', 'hr', 'finance', 'admin'],
      required: true
    },
    approver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    comments: String,
    approvedAt: Date,
    rejectedAt: Date,
    rejectionReason: String
  }],

  // Priority and Urgency
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  isUrgent: {
    type: Boolean,
    default: false
  },
  urgencyReason: String,

  // Dates and Timeline
  initiatedAt: {
    type: Date,
    default: Date.now
  },
  expectedCompletionDate: Date,
  actualCompletionDate: Date,
  
  // Metadata
  tags: [String],
  notes: [{
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    content: String,
    addedAt: {
      type: Date,
      default: Date.now
    },
    isPrivate: {
      type: Boolean,
      default: false
    }
  }],

  // Integration References
  payrollRecordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payroll'
  },
  assetClearanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AssetClearance'
  },
  handoverRecordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HandoverDetail'
  },
  settlementRecordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinalSettlement'
  },
  feedbackRecordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExitFeedback'
  },

  // Audit Trail
  statusHistory: [{
    status: String,
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    reason: String
  }],

  // Completion Status
  completionPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  completedAt: Date,
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Employee Snapshot - stores complete employee data when offboarding is completed
  employeeSnapshot: {
    type: mongoose.Schema.Types.Mixed, // Store complete employee data
    default: {}
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
offboardingRequestSchema.index({ employeeId: 1, clientId: 1 });
offboardingRequestSchema.index({ status: 1, currentStage: 1 });
offboardingRequestSchema.index({ lastWorkingDay: 1 });
offboardingRequestSchema.index({ initiatedAt: 1 });
offboardingRequestSchema.index({ 'approvals.approver': 1, 'approvals.status': 1 });

// Virtual for days remaining
offboardingRequestSchema.virtual('daysRemaining').get(function() {
  if (!this.lastWorkingDay) return null;
  const today = new Date();
  const lwd = new Date(this.lastWorkingDay);
  const diffTime = lwd - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Virtual for duration
offboardingRequestSchema.virtual('processingDuration').get(function() {
  const start = this.initiatedAt;
  const end = this.completedAt || new Date();
  const diffTime = end - start;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Pre-save middleware
offboardingRequestSchema.pre('save', function(next) {
  // Update status history
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      changedAt: new Date()
    });
  }

  // Set completion date
  if (this.status === 'closed' && !this.completedAt) {
    this.completedAt = new Date();
    this.isCompleted = true;
    this.completionPercentage = 100;
  }

  next();
});

// Static methods
offboardingRequestSchema.statics.getByEmployee = function(employeeId, clientId) {
  return this.find({ employeeId, clientId })
    .populate('employeeId', 'firstName lastName email employeeCode')
    .populate('initiatedBy', 'email')
    .sort({ createdAt: -1 });
};

offboardingRequestSchema.statics.getPendingApprovals = function(approverId, clientId) {
  return this.find({
    clientId,
    'approvals.approver': approverId,
    'approvals.status': 'pending'
  }).populate('employeeId', 'firstName lastName email employeeCode');
};

offboardingRequestSchema.statics.getActiveRequests = function(clientId) {
  return this.find({
    clientId,
    status: { $nin: ['closed', 'cancelled'] }
  }).populate('employeeId', 'firstName lastName email employeeCode');
};

module.exports = offboardingRequestSchema;
