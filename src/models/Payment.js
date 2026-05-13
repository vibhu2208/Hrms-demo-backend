const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentId: {
    type: String,
    unique: true,
    sparse: true
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true
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
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  paymentMethod: {
    type: String,
    enum: ['online', 'offline', 'bank_transfer', 'check', 'cash', 'card', 'digital_wallet', 'cryptocurrency'],
    required: true
  },
  paymentGateway: {
    type: String,
    enum: ['stripe', 'paypal', 'razorpay', 'square', 'manual', 'bank', 'other']
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded'],
    default: 'pending'
  },
  transactionId: {
    type: String,
    index: true
  },
  gatewayTransactionId: String, // Payment gateway's transaction ID
  paymentReference: String, // Internal reference number
  checkNumber: String, // For check payments
  bankReference: String, // For bank transfers
  paymentDate: {
    type: Date,
    default: Date.now
  },
  processedDate: Date,
  failureReason: String,
  gatewayResponse: {
    type: mongoose.Schema.Types.Mixed // Store gateway response data
  },
  fees: {
    gatewayFee: {
      type: Number,
      default: 0
    },
    processingFee: {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      default: 0
    }
  },
  refund: {
    isRefunded: {
      type: Boolean,
      default: false
    },
    refundAmount: {
      type: Number,
      default: 0
    },
    refundDate: Date,
    refundReason: String,
    refundTransactionId: String
  },
  billingDetails: {
    name: String,
    email: String,
    phone: String,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    }
  },
  paymentDetails: {
    cardLast4: String,
    cardBrand: String,
    cardExpiry: String,
    bankName: String,
    accountLast4: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed // Additional data
  },
  notes: String,
  internalNotes: String,
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verifiedDate: Date,
  reconciled: {
    type: Boolean,
    default: false
  },
  reconciledDate: Date,
  reconciledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Generate payment ID before saving
paymentSchema.pre('save', async function(next) {
  if (!this.paymentId) {
    const currentYear = new Date().getFullYear();
    const count = await mongoose.model('Payment').countDocuments({
      createdAt: {
        $gte: new Date(currentYear, 0, 1),
        $lt: new Date(currentYear + 1, 0, 1)
      }
    });
    this.paymentId = `PAY-${currentYear}-${String(count + 1).padStart(5, '0')}`;
  }
  
  // Calculate total fees
  if (this.isModified('fees.gatewayFee') || this.isModified('fees.processingFee')) {
    this.fees.total = (this.fees.gatewayFee || 0) + (this.fees.processingFee || 0);
  }
  
  // Set processed date when status changes to completed
  if (this.isModified('status') && this.status === 'completed' && !this.processedDate) {
    this.processedDate = new Date();
  }
  
  next();
});

// Indexes for better query performance
paymentSchema.index({ invoiceId: 1, status: 1 });
paymentSchema.index({ subscriptionId: 1, status: 1 });
paymentSchema.index({ clientId: 1, status: 1 });
paymentSchema.index({ paymentId: 1 });
paymentSchema.index({ transactionId: 1 });
paymentSchema.index({ paymentDate: -1 });
paymentSchema.index({ status: 1, paymentDate: -1 });
paymentSchema.index({ paymentMethod: 1, status: 1 });

// Virtual for net amount (amount minus fees)
paymentSchema.virtual('netAmount').get(function() {
  return this.amount - (this.fees.total || 0);
});

// Virtual for refundable amount
paymentSchema.virtual('refundableAmount').get(function() {
  return this.amount - (this.refund.refundAmount || 0);
});

// Virtual for checking if payment is successful
paymentSchema.virtual('isSuccessful').get(function() {
  return this.status === 'completed';
});

// Virtual for checking if payment is pending
paymentSchema.virtual('isPending').get(function() {
  return ['pending', 'processing'].includes(this.status);
});

// Virtual for checking if payment failed
paymentSchema.virtual('isFailed').get(function() {
  return ['failed', 'cancelled'].includes(this.status);
});

// Method to mark payment as completed
paymentSchema.methods.markAsCompleted = function(transactionId, gatewayResponse) {
  this.status = 'completed';
  this.processedDate = new Date();
  if (transactionId) this.transactionId = transactionId;
  if (gatewayResponse) this.gatewayResponse = gatewayResponse;
  return this.save();
};

// Method to mark payment as failed
paymentSchema.methods.markAsFailed = function(reason, gatewayResponse) {
  this.status = 'failed';
  this.failureReason = reason;
  if (gatewayResponse) this.gatewayResponse = gatewayResponse;
  return this.save();
};

// Method to process refund
paymentSchema.methods.processRefund = function(amount, reason, refundTransactionId) {
  const refundAmount = amount || this.amount;
  
  this.refund.isRefunded = true;
  this.refund.refundAmount = (this.refund.refundAmount || 0) + refundAmount;
  this.refund.refundDate = new Date();
  this.refund.refundReason = reason;
  this.refund.refundTransactionId = refundTransactionId;
  
  // Update status based on refund amount
  if (this.refund.refundAmount >= this.amount) {
    this.status = 'refunded';
  } else {
    this.status = 'partially_refunded';
  }
  
  return this.save();
};

// Method to verify payment
paymentSchema.methods.verify = function(verifiedBy) {
  this.verifiedBy = verifiedBy;
  this.verifiedDate = new Date();
  return this.save();
};

// Method to reconcile payment
paymentSchema.methods.reconcile = function(reconciledBy) {
  this.reconciled = true;
  this.reconciledDate = new Date();
  this.reconciledBy = reconciledBy;
  return this.save();
};

// Static method to find payments by status
paymentSchema.statics.findByStatus = function(status) {
  return this.find({ status }).populate('invoiceId subscriptionId clientId');
};

// Static method to find pending payments
paymentSchema.statics.findPending = function() {
  return this.find({
    status: { $in: ['pending', 'processing'] }
  }).populate('invoiceId subscriptionId clientId');
};

// Static method to find failed payments
paymentSchema.statics.findFailed = function() {
  return this.find({
    status: { $in: ['failed', 'cancelled'] }
  }).populate('invoiceId subscriptionId clientId');
};

// Static method to get payment statistics
paymentSchema.statics.getPaymentStats = function(startDate, endDate) {
  const matchStage = {
    paymentDate: {
      $gte: startDate || new Date(new Date().getFullYear(), 0, 1),
      $lte: endDate || new Date()
    }
  };
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        averageAmount: { $avg: '$amount' }
      }
    }
  ]);
};

// Static method to get payment method breakdown
paymentSchema.statics.getPaymentMethodStats = function(startDate, endDate) {
  const matchStage = {
    status: 'completed',
    paymentDate: {
      $gte: startDate || new Date(new Date().getFullYear(), 0, 1),
      $lte: endDate || new Date()
    }
  };
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$paymentMethod',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);
};

// Static method to get daily payment summary
paymentSchema.statics.getDailyPaymentSummary = function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        status: 'completed',
        paymentDate: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$paymentDate' },
          month: { $month: '$paymentDate' },
          day: { $dayOfMonth: '$paymentDate' }
        },
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
    }
  ]);
};

module.exports = mongoose.model('Payment', paymentSchema);
