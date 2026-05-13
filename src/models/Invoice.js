const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
    required: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  packageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Package',
    required: true
  },
  billingPeriod: {
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    }
  },
  amount: {
    subtotal: {
      type: Number,
      required: true
    },
    discount: {
      type: Number,
      default: 0
    },
    tax: {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      required: true
    }
  },
  currency: {
    type: String,
    default: 'USD'
  },
  status: {
    type: String,
    enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded'],
    default: 'draft'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['online', 'offline', 'bank_transfer', 'check', 'cash', 'card'],
    default: 'online'
  },
  transactionId: String,
  paymentReference: String,
  dueDate: {
    type: Date,
    required: true
  },
  paidDate: Date,
  paidAmount: {
    type: Number,
    default: 0
  },
  itemDetails: [{
    description: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      default: 1
    },
    unitPrice: {
      type: Number,
      required: true
    },
    total: {
      type: Number,
      required: true
    }
  }],
  discountDetails: {
    percentage: {
      type: Number,
      default: 0
    },
    amount: {
      type: Number,
      default: 0
    },
    reason: String
  },
  taxDetails: {
    percentage: {
      type: Number,
      default: 0
    },
    amount: {
      type: Number,
      default: 0
    },
    taxType: String // VAT, GST, Sales Tax, etc.
  },
  billingAddress: {
    companyName: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    postalCode: String,
    country: String
  },
  notes: String,
  internalNotes: String,
  emailSent: {
    type: Boolean,
    default: false
  },
  emailSentDate: Date,
  remindersSent: {
    type: Number,
    default: 0
  },
  lastReminderDate: Date,
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Generate invoice number before saving
invoiceSchema.pre('save', async function(next) {
  if (!this.invoiceNumber) {
    const currentYear = new Date().getFullYear();
    const count = await mongoose.model('Invoice').countDocuments({
      createdAt: {
        $gte: new Date(currentYear, 0, 1),
        $lt: new Date(currentYear + 1, 0, 1)
      }
    });
    this.invoiceNumber = `INV-${currentYear}-${String(count + 1).padStart(4, '0')}`;
  }
  
  // Calculate total amount
  if (this.isModified('amount.subtotal') || this.isModified('amount.discount') || this.isModified('amount.tax')) {
    this.amount.total = this.amount.subtotal - this.amount.discount + this.amount.tax;
  }
  
  next();
});

// Indexes for better query performance
invoiceSchema.index({ subscriptionId: 1, status: 1 });
invoiceSchema.index({ clientId: 1, status: 1 });
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ dueDate: 1, status: 1 });
invoiceSchema.index({ createdAt: -1 });
invoiceSchema.index({ 'billingPeriod.startDate': 1, 'billingPeriod.endDate': 1 });

// Virtual for checking if invoice is overdue
invoiceSchema.virtual('isOverdue').get(function() {
  if (this.status === 'paid' || this.status === 'cancelled') return false;
  return new Date() > new Date(this.dueDate);
});

// Virtual for days overdue
invoiceSchema.virtual('daysOverdue').get(function() {
  if (!this.isOverdue) return 0;
  const now = new Date();
  const due = new Date(this.dueDate);
  const diffTime = now - due;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for remaining amount
invoiceSchema.virtual('remainingAmount').get(function() {
  return Math.max(0, this.amount.total - this.paidAmount);
});

// Virtual for payment completion percentage
invoiceSchema.virtual('paymentPercentage').get(function() {
  if (this.amount.total === 0) return 100;
  return Math.round((this.paidAmount / this.amount.total) * 100);
});

// Method to mark invoice as paid
invoiceSchema.methods.markAsPaid = function(amount, paymentMethod, transactionId, paymentReference) {
  this.paidAmount = amount || this.amount.total;
  this.paidDate = new Date();
  this.paymentMethod = paymentMethod || this.paymentMethod;
  this.transactionId = transactionId;
  this.paymentReference = paymentReference;
  
  if (this.paidAmount >= this.amount.total) {
    this.status = 'paid';
    this.paymentStatus = 'paid';
  } else {
    this.paymentStatus = 'partial';
  }
  
  return this.save();
};

// Method to send reminder
invoiceSchema.methods.sendReminder = function() {
  this.remindersSent += 1;
  this.lastReminderDate = new Date();
  return this.save();
};

// Method to calculate late fees (if applicable)
invoiceSchema.methods.calculateLateFee = function(lateFeePercentage = 0) {
  if (!this.isOverdue || lateFeePercentage === 0) return 0;
  return Math.round(this.amount.total * (lateFeePercentage / 100) * 100) / 100;
};

// Static method to find overdue invoices
invoiceSchema.statics.findOverdue = function() {
  return this.find({
    status: { $nin: ['paid', 'cancelled', 'refunded'] },
    dueDate: { $lt: new Date() }
  }).populate('clientId subscriptionId packageId');
};

// Static method to find invoices due soon
invoiceSchema.statics.findDueSoon = function(days = 7) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  
  return this.find({
    status: { $nin: ['paid', 'cancelled', 'refunded'] },
    dueDate: { $lte: futureDate, $gte: new Date() }
  }).populate('clientId subscriptionId packageId');
};

// Static method to get revenue statistics
invoiceSchema.statics.getRevenueStats = function(startDate, endDate) {
  const matchStage = {
    status: 'paid',
    paidDate: {
      $gte: startDate || new Date(new Date().getFullYear(), 0, 1),
      $lte: endDate || new Date()
    }
  };
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$paidAmount' },
        totalInvoices: { $sum: 1 },
        averageInvoiceValue: { $avg: '$amount.total' }
      }
    }
  ]);
};

// Static method to get monthly revenue breakdown
invoiceSchema.statics.getMonthlyRevenue = function(year) {
  const currentYear = year || new Date().getFullYear();
  
  return this.aggregate([
    {
      $match: {
        status: 'paid',
        paidDate: {
          $gte: new Date(currentYear, 0, 1),
          $lt: new Date(currentYear + 1, 0, 1)
        }
      }
    },
    {
      $group: {
        _id: { $month: '$paidDate' },
        revenue: { $sum: '$paidAmount' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id': 1 }
    }
  ]);
};

module.exports = mongoose.model('Invoice', invoiceSchema);
