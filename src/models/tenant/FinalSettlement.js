const mongoose = require('mongoose');

/**
 * Final Settlement Model - Payroll/F&F calculations
 * Phase 1: Module Setup & Data Model
 */
const finalSettlementSchema = new mongoose.Schema({
  // Reference Information
  offboardingRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OffboardingRequest',
    required: true,
    index: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true
  },

  // Settlement Period
  settlementPeriod: {
    fromDate: {
      type: Date,
      required: true
    },
    toDate: {
      type: Date,
      required: true
    },
    workingDays: Number,
    totalDays: Number
  },

  // Salary Components
  salaryComponents: {
    // Basic Salary
    basicSalary: {
      monthlyAmount: Number,
      dailyRate: Number,
      daysWorked: Number,
      amount: Number
    },
    
    // Allowances
    hra: {
      monthlyAmount: Number,
      dailyRate: Number,
      daysWorked: Number,
      amount: Number
    },
    conveyanceAllowance: {
      monthlyAmount: Number,
      dailyRate: Number,
      daysWorked: Number,
      amount: Number
    },
    medicalAllowance: {
      monthlyAmount: Number,
      dailyRate: Number,
      daysWorked: Number,
      amount: Number
    },
    specialAllowance: {
      monthlyAmount: Number,
      dailyRate: Number,
      daysWorked: Number,
      amount: Number
    },
    otherAllowances: [{
      name: String,
      monthlyAmount: Number,
      dailyRate: Number,
      daysWorked: Number,
      amount: Number
    }],
    
    // Variable Pay
    bonus: {
      type: Number,
      default: 0
    },
    incentives: {
      type: Number,
      default: 0
    },
    commission: {
      type: Number,
      default: 0
    },
    overtime: {
      hours: Number,
      rate: Number,
      amount: Number
    }
  },

  // Leave Encashment
  leaveEncashment: {
    earnedLeaves: {
      totalEarned: Number,
      used: Number,
      balance: Number,
      encashable: Number,
      ratePerDay: Number,
      amount: Number
    },
    sickLeaves: {
      totalEarned: Number,
      used: Number,
      balance: Number,
      encashable: Number,
      ratePerDay: Number,
      amount: Number
    },
    casualLeaves: {
      totalEarned: Number,
      used: Number,
      balance: Number,
      encashable: Number,
      ratePerDay: Number,
      amount: Number
    },
    totalEncashment: Number
  },

  // Notice Period
  noticePeriod: {
    required: Number, // days
    served: Number, // days
    shortfall: Number, // days
    shortfallAmount: Number,
    waived: Boolean,
    waivedReason: String
  },

  // Reimbursements
  reimbursements: [{
    category: {
      type: String,
      enum: ['travel', 'medical', 'communication', 'training', 'other']
    },
    description: String,
    amount: Number,
    receiptNumber: String,
    receiptUrl: String,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: Date,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    }
  }],

  // Deductions
  deductions: {
    // Statutory Deductions
    providentFund: {
      employeeContribution: Number,
      employerContribution: Number,
      totalAmount: Number
    },
    esi: {
      employeeContribution: Number,
      employerContribution: Number,
      totalAmount: Number
    },
    professionalTax: Number,
    incomeTax: {
      tdsDeducted: Number,
      additionalTax: Number,
      totalAmount: Number
    },
    
    // Other Deductions
    loanRecovery: [{
      loanType: String,
      principalAmount: Number,
      interestAmount: Number,
      totalAmount: Number,
      remainingBalance: Number
    }],
    advanceRecovery: [{
      advanceType: String,
      amount: Number,
      description: String
    }],
    assetRecovery: [{
      assetName: String,
      amount: Number,
      reason: String
    }],
    otherDeductions: [{
      name: String,
      amount: Number,
      description: String
    }],
    
    totalDeductions: Number
  },

  // Gratuity
  gratuity: {
    eligible: Boolean,
    yearsOfService: Number,
    monthsOfService: Number,
    lastDrawnSalary: Number,
    gratuityAmount: Number,
    calculationMethod: String,
    notes: String
  },

  // Settlement Summary
  settlementSummary: {
    grossEarnings: Number,
    totalDeductions: Number,
    netPayable: Number,
    roundOffAdjustment: Number,
    finalAmount: Number
  },

  // Payment Details
  paymentDetails: {
    paymentMethod: {
      type: String,
      enum: ['bank_transfer', 'cheque', 'cash', 'demand_draft'],
      default: 'bank_transfer'
    },
    bankDetails: {
      accountNumber: String,
      bankName: String,
      ifscCode: String,
      accountHolderName: String,
      branch: String
    },
    chequeDetails: {
      chequeNumber: String,
      chequeDate: Date,
      bankName: String
    },
    paymentDate: Date,
    paymentReference: String,
    paymentStatus: {
      type: String,
      enum: ['pending', 'processed', 'completed', 'failed', 'cancelled'],
      default: 'pending'
    },
    paymentNotes: String
  },

  // Approvals
  approvals: [{
    level: {
      type: String,
      enum: ['finance_team', 'finance_manager', 'hr_manager', 'cfo'],
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

  // Documents
  documents: [{
    documentType: {
      type: String,
      enum: [
        'settlement_statement', 'form16', 'pf_withdrawal', 'gratuity_form',
        'leave_encashment', 'reimbursement_receipts', 'loan_closure', 'other'
      ]
    },
    fileName: String,
    fileUrl: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Status and Timeline
  calculationStatus: {
    type: String,
    enum: ['draft', 'calculated', 'reviewed', 'approved', 'paid'],
    default: 'draft'
  },
  calculatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  calculatedAt: Date,
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  
  // Employee Acknowledgment
  employeeAcknowledgment: {
    acknowledged: Boolean,
    acknowledgedAt: Date,
    digitalSignature: String,
    comments: String
  },

  // Compliance and Legal
  complianceChecks: [{
    checkType: {
      type: String,
      enum: ['pf_compliance', 'esi_compliance', 'tax_compliance', 'gratuity_compliance', 'legal_clearance']
    },
    status: {
      type: String,
      enum: ['pending', 'compliant', 'non_compliant'],
      default: 'pending'
    },
    checkedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    checkedAt: Date,
    notes: String,
    issues: [String]
  }],

  // Additional Information
  specialInstructions: String,
  internalNotes: String,
  
  // Revision History
  revisions: [{
    revisionNumber: Number,
    revisedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    revisedAt: {
      type: Date,
      default: Date.now
    },
    changes: String,
    reason: String
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
finalSettlementSchema.index({ offboardingRequestId: 1 });
finalSettlementSchema.index({ employeeId: 1, clientId: 1 });
finalSettlementSchema.index({ calculationStatus: 1 });
finalSettlementSchema.index({ 'paymentDetails.paymentStatus': 1 });
finalSettlementSchema.index({ 'approvals.approver': 1, 'approvals.status': 1 });

// Virtual for total earnings
finalSettlementSchema.virtual('totalEarnings').get(function() {
  let total = 0;
  const salary = this.salaryComponents;
  
  if (salary.basicSalary) total += salary.basicSalary.amount || 0;
  if (salary.hra) total += salary.hra.amount || 0;
  if (salary.conveyanceAllowance) total += salary.conveyanceAllowance.amount || 0;
  if (salary.medicalAllowance) total += salary.medicalAllowance.amount || 0;
  if (salary.specialAllowance) total += salary.specialAllowance.amount || 0;
  
  if (salary.otherAllowances) {
    total += salary.otherAllowances.reduce((sum, allowance) => sum + (allowance.amount || 0), 0);
  }
  
  total += salary.bonus || 0;
  total += salary.incentives || 0;
  total += salary.commission || 0;
  if (salary.overtime) total += salary.overtime.amount || 0;
  
  total += this.leaveEncashment?.totalEncashment || 0;
  total += this.gratuity?.gratuityAmount || 0;
  
  // Add approved reimbursements
  if (this.reimbursements) {
    total += this.reimbursements
      .filter(r => r.status === 'approved')
      .reduce((sum, r) => sum + (r.amount || 0), 0);
  }
  
  return total;
});

// Virtual for approval status
finalSettlementSchema.virtual('approvalStatus').get(function() {
  if (!this.approvals || this.approvals.length === 0) return 'not_required';
  
  const hasRejected = this.approvals.some(a => a.status === 'rejected');
  if (hasRejected) return 'rejected';
  
  const allApproved = this.approvals.every(a => a.status === 'approved');
  if (allApproved) return 'approved';
  
  const hasPending = this.approvals.some(a => a.status === 'pending');
  if (hasPending) return 'pending';
  
  return 'pending';
});

// Pre-save middleware
finalSettlementSchema.pre('save', function(next) {
  // Calculate settlement summary
  this.settlementSummary.grossEarnings = this.totalEarnings;
  this.settlementSummary.totalDeductions = this.deductions?.totalDeductions || 0;
  this.settlementSummary.netPayable = this.settlementSummary.grossEarnings - this.settlementSummary.totalDeductions;
  
  // Apply rounding
  const roundOff = this.settlementSummary.roundOffAdjustment || 0;
  this.settlementSummary.finalAmount = Math.round(this.settlementSummary.netPayable + roundOff);
  
  // Update calculation status based on approvals
  if (this.approvalStatus === 'approved' && this.calculationStatus === 'reviewed') {
    this.calculationStatus = 'approved';
  }
  
  next();
});

// Static methods
finalSettlementSchema.statics.getByEmployee = function(employeeId, clientId) {
  return this.findOne({ employeeId, clientId })
    .populate('employeeId', 'firstName lastName email employeeCode')
    .populate('calculatedBy', 'email firstName lastName')
    .populate('reviewedBy', 'email firstName lastName');
};

finalSettlementSchema.statics.getPendingApprovals = function(approverId, clientId) {
  return this.find({
    clientId,
    'approvals.approver': approverId,
    'approvals.status': 'pending'
  }).populate('employeeId', 'firstName lastName email employeeCode');
};

finalSettlementSchema.statics.getPendingPayments = function(clientId) {
  return this.find({
    clientId,
    calculationStatus: 'approved',
    'paymentDetails.paymentStatus': { $in: ['pending', 'processed'] }
  }).populate('employeeId', 'firstName lastName email employeeCode');
};

module.exports = finalSettlementSchema;
