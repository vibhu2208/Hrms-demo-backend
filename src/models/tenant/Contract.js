/**
 * Contract Model - Tenant-specific
 * Manages employment contracts for contract-based employees
 */

const mongoose = require('mongoose');

const contractSchema = new mongoose.Schema({
  // Employee Reference
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenantEmployee',
    required: true
  },
  employeeCode: {
    type: String,
    required: true
  },
  employeeName: {
    type: String,
    required: true
  },
  employeeEmail: {
    type: String,
    required: true
  },

  // Contract Type
  contractType: {
    type: String,
    enum: ['fixed-deliverable', 'rate-based', 'hourly-based'],
    required: true
  },

  // Contract Details
  contractNumber: {
    type: String,
    unique: true,
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String
  },

  // Contract Period
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  duration: {
    type: Number, // Duration in days
  },

  // Contract Type Specific Details
  
  // For Fixed Deliverable
  deliverables: [{
    description: {
      type: String
    },
    dueDate: {
      type: Date
    },
    status: {
      type: String,
      enum: ['pending', 'in-progress', 'completed', 'delayed'],
      default: 'pending'
    },
    completedDate: {
      type: Date
    }
  }],
  totalAmount: {
    type: Number,
    default: 0
  },
  
  // For Rate-Based
  rateAmount: {
    type: Number // Rate per month/project milestone
  },
  ratePeriod: {
    type: String,
    enum: ['monthly', 'quarterly', 'milestone-based']
  },
  
  // For Hourly-Based
  hourlyRate: {
    type: Number
  },
  estimatedHours: {
    type: Number
  },
  actualHours: {
    type: Number,
    default: 0
  },
  maxHoursPerWeek: {
    type: Number
  },

  // Payment Terms
  paymentTerms: {
    type: String
  },
  invoiceCycle: {
    type: String,
    enum: ['weekly', 'bi-weekly', 'monthly', 'on-completion', 'milestone-based'],
    default: 'monthly'
  },

  // Status
  status: {
    type: String,
    enum: ['draft', 'active', 'pending-renewal', 'expired', 'terminated', 'completed'],
    default: 'draft'
  },

  // Renewal Information
  isRenewable: {
    type: Boolean,
    default: false
  },
  renewalDate: {
    type: Date
  },
  autoRenew: {
    type: Boolean,
    default: false
  },
  renewalTerms: {
    type: String
  },
  renewalNotificationSent: {
    type: Boolean,
    default: false
  },
  renewalNotificationDate: {
    type: Date
  },
  renewalReminderDays: {
    type: Number,
    default: 30 // Days before end date to send reminder
  },

  // Renewal History
  renewalHistory: [{
    renewedDate: {
      type: Date
    },
    previousEndDate: {
      type: Date
    },
    newEndDate: {
      type: Date
    },
    renewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TenantUser'
    },
    notes: {
      type: String
    }
  }],

  // Termination Information
  terminationDate: {
    type: Date
  },
  terminationReason: {
    type: String
  },
  terminatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenantUser'
  },

  // Documents
  documents: [{
    name: {
      type: String
    },
    url: {
      type: String
    },
    uploadedDate: {
      type: Date,
      default: Date.now
    },
    type: {
      type: String,
      enum: ['contract', 'amendment', 'invoice', 'completion-certificate', 'other']
    }
  }],

  // Approval Workflow
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenantUser'
  },
  approvedDate: {
    type: Date
  },
  rejectionReason: {
    type: String
  },

  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenantUser',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenantUser'
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes for performance
contractSchema.index({ employeeId: 1 });
contractSchema.index({ contractNumber: 1 });
contractSchema.index({ status: 1 });
contractSchema.index({ endDate: 1 });
contractSchema.index({ startDate: 1 });
contractSchema.index({ contractType: 1 });
contractSchema.index({ 'renewalDate': 1 });

// Virtual for days until expiry
contractSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.endDate) return null;
  const today = new Date();
  const diffTime = this.endDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Virtual for is expiring soon
contractSchema.virtual('isExpiringSoon').get(function() {
  const daysUntil = this.daysUntilExpiry;
  return daysUntil !== null && daysUntil <= this.renewalReminderDays && daysUntil > 0;
});

// Virtual for is expired
contractSchema.virtual('isExpired').get(function() {
  if (!this.endDate) return false;
  return new Date() > this.endDate;
});

// Pre-save middleware to calculate duration
contractSchema.pre('save', function(next) {
  if (this.startDate && this.endDate) {
    const diffTime = this.endDate - this.startDate;
    this.duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  // Set renewal date if not set
  if (this.isRenewable && !this.renewalDate && this.endDate) {
    const renewalDate = new Date(this.endDate);
    renewalDate.setDate(renewalDate.getDate() - this.renewalReminderDays);
    this.renewalDate = renewalDate;
  }
  
  // Update status based on dates
  const today = new Date();
  if (this.endDate < today && this.status === 'active') {
    this.status = 'expired';
  }
  
  next();
});

// Instance method to check if renewal notification is due
contractSchema.methods.isRenewalNotificationDue = function() {
  if (!this.isRenewable || this.renewalNotificationSent) return false;
  
  const today = new Date();
  const daysUntilExpiry = Math.ceil((this.endDate - today) / (1000 * 60 * 60 * 24));
  
  return daysUntilExpiry <= this.renewalReminderDays && daysUntilExpiry > 0;
};

// Instance method to renew contract
contractSchema.methods.renewContract = function(newEndDate, renewedBy, notes) {
  this.renewalHistory.push({
    renewedDate: new Date(),
    previousEndDate: this.endDate,
    newEndDate: newEndDate,
    renewedBy: renewedBy,
    notes: notes
  });
  
  this.endDate = newEndDate;
  this.status = 'active';
  this.renewalNotificationSent = false;
  this.renewalNotificationDate = null;
  
  // Recalculate renewal date
  if (this.isRenewable) {
    const renewalDate = new Date(newEndDate);
    renewalDate.setDate(renewalDate.getDate() - this.renewalReminderDays);
    this.renewalDate = renewalDate;
  }
  
  return this.save();
};

// Instance method to get contract summary
contractSchema.methods.getSummary = function() {
  return {
    id: this._id,
    contractNumber: this.contractNumber,
    title: this.title,
    employeeName: this.employeeName,
    contractType: this.contractType,
    startDate: this.startDate,
    endDate: this.endDate,
    status: this.status,
    daysUntilExpiry: this.daysUntilExpiry,
    isExpiringSoon: this.isExpiringSoon,
    isExpired: this.isExpired
  };
};

// Static method to find expiring contracts
contractSchema.statics.findExpiringContracts = function(days = 30) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  
  return this.find({
    status: 'active',
    isRenewable: true,
    endDate: {
      $gte: new Date(),
      $lte: futureDate
    },
    renewalNotificationSent: false
  });
};

module.exports = contractSchema;
