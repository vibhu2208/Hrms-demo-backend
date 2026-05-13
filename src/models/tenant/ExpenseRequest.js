/**
 * Expense Request Model - Stored in tenant database
 * Tracks employee expense claims and reimbursements
 */

const mongoose = require('mongoose');

const expenseRequestSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
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
  expenseType: {
    type: String,
    required: true,
    enum: ['travel', 'food', 'accommodation', 'fuel', 'office_supplies', 'client_entertainment', 'training', 'medical', 'communication', 'other']
  },
  category: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  expenseDate: {
    type: Date,
    required: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  // Receipt/Bill details
  receipts: [{
    fileName: String,
    fileUrl: String,
    fileSize: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  billNumber: String,
  vendorName: String,
  // Project/Client association
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  projectName: String,
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  },
  clientName: String,
  isBillable: {
    type: Boolean,
    default: false
  },
  // Status and approval
  status: {
    type: String,
    enum: ['draft', 'pending', 'approved', 'rejected', 'paid', 'cancelled'],
    default: 'pending',
    index: true
  },
  approvalInstanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ApprovalInstance'
  },
  // Payment details
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'cash', 'cheque', 'wallet', 'pending'],
    default: 'pending'
  },
  paidAmount: Number,
  paidOn: Date,
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  transactionId: String,
  // Approval history
  approvalHistory: [{
    approver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approverEmail: String,
    action: {
      type: String,
      enum: ['approved', 'rejected', 'sent_back']
    },
    comments: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  // Rejection details
  rejectionReason: String,
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: Date,
  // Metadata
  notes: String,
  tags: [String],
  submittedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
expenseRequestSchema.index({ employeeId: 1, status: 1 });
expenseRequestSchema.index({ expenseDate: 1 });
expenseRequestSchema.index({ amount: 1 });
expenseRequestSchema.index({ status: 1, submittedAt: -1 });

// Virtual for formatted amount
expenseRequestSchema.virtual('formattedAmount').get(function() {
  return `${this.currency} ${this.amount.toLocaleString('en-IN')}`;
});

// Method to check if expense can be edited
expenseRequestSchema.methods.canEdit = function() {
  return ['draft', 'rejected'].includes(this.status);
};

// Method to check if expense can be cancelled
expenseRequestSchema.methods.canCancel = function() {
  return ['draft', 'pending'].includes(this.status);
};

module.exports = expenseRequestSchema;
