const mongoose = require('mongoose');

const approvalInstanceSchema = new mongoose.Schema({
  requestType: {
    type: String,
    required: true,
    enum: ['leave', 'attendance', 'expense', 'payroll', 'asset', 'document', 'offboarding', 'onboarding_approval', 'other']
  },
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  workflowId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ApprovalWorkflow'
  },
  currentLevel: {
    type: Number,
    default: 1
  },
  totalLevels: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled', 'escalated'],
    default: 'pending'
  },
  approvalChain: [{
    level: {
      type: Number,
      required: true
    },
    approverType: {
      type: String,
      enum: ['manager', 'hr', 'department_head', 'finance', 'ceo', 'company_admin', 'custom'],
      required: true
    },
    approverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approverEmail: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'skipped', 'delegated'],
      default: 'pending'
    },
    actionDate: Date,
    comments: String,
    delegatedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    sla: {
      dueDate: Date,
      escalationDate: Date,
      isEscalated: {
        type: Boolean,
        default: false
      },
      escalatedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }
  }],
  metadata: {
    amount: Number,
    duration: Number,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    tags: [String],
    customFields: mongoose.Schema.Types.Mixed
  },
  slaStatus: {
    startDate: {
      type: Date,
      default: Date.now
    },
    expectedCompletionDate: Date,
    actualCompletionDate: Date,
    isBreached: {
      type: Boolean,
      default: false
    },
    breachReason: String
  },
  notifications: [{
    sentTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    type: {
      type: String,
      enum: ['pending', 'reminder', 'escalation', 'approved', 'rejected']
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    channel: {
      type: String,
      enum: ['email', 'sms', 'push', 'in-app'],
      default: 'email'
    }
  }],
  history: [{
    action: String,
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true
});

// Indexes
approvalInstanceSchema.index({ requestType: 1, requestId: 1 });
approvalInstanceSchema.index({ requestedBy: 1, status: 1 });
approvalInstanceSchema.index({ 'approvalChain.approverId': 1, 'approvalChain.status': 1 });
approvalInstanceSchema.index({ status: 1, createdAt: -1 });
approvalInstanceSchema.index({ 'slaStatus.isBreached': 1 });

// Method to get current approver
approvalInstanceSchema.methods.getCurrentApprover = function() {
  return this.approvalChain.find(step => 
    step.level === this.currentLevel && step.status === 'pending'
  );
};

// Method to check if SLA is breached
approvalInstanceSchema.methods.checkSLABreach = function() {
  const currentApprover = this.getCurrentApprover();
  if (!currentApprover || !currentApprover.sla) return false;
  
  const now = new Date();
  if (currentApprover.sla.dueDate && now > currentApprover.sla.dueDate) {
    return true;
  }
  return false;
};

// Method to add history entry
approvalInstanceSchema.methods.addHistory = function(action, performedBy, details = {}) {
  this.history.push({
    action,
    performedBy,
    timestamp: new Date(),
    details
  });
};

module.exports = approvalInstanceSchema;
