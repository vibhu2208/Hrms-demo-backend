const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  subscriptionCode: {
    type: String,
    unique: true,
    sparse: true
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
  clientPackageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClientPackage',
    required: false // Optional for backward compatibility
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'pending_payment', 'expired', 'suspended', 'cancelled'],
    default: 'active'
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'quarterly', 'yearly', 'custom'],
    default: 'monthly'
  },
  basePrice: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  discount: {
    percentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    amount: {
      type: Number,
      default: 0
    },
    reason: String,
    validUntil: Date
  },
  tax: {
    percentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    amount: {
      type: Number,
      default: 0
    }
  },
  autoRenew: {
    type: Boolean,
    default: false
  },
  trialDays: {
    type: Number,
    default: 0
  },
  gracePeriodDays: {
    type: Number,
    default: 3
  },
  nextBillingDate: {
    type: Date
  },
  lastBillingDate: {
    type: Date
  },
  renewalCount: {
    type: Number,
    default: 0
  },
  totalRevenue: {
    type: Number,
    default: 0
  },
  notes: String,
  assignedBy: {
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

// Generate subscription code before saving
subscriptionSchema.pre('save', async function(next) {
  if (!this.subscriptionCode) {
    const count = await mongoose.model('Subscription').countDocuments();
    this.subscriptionCode = `SUB${String(count + 1).padStart(4, '0')}`;
  }
  
  // Set next billing date if not set
  if (!this.nextBillingDate && this.status === 'active') {
    this.nextBillingDate = new Date(this.endDate);
  }
  
  next();
});

// Indexes for better query performance
subscriptionSchema.index({ clientId: 1, status: 1 });
subscriptionSchema.index({ packageId: 1, status: 1 });
subscriptionSchema.index({ endDate: 1, status: 1 });
subscriptionSchema.index({ nextBillingDate: 1, status: 1 });
subscriptionSchema.index({ subscriptionCode: 1 });

// Virtual for calculating days remaining
subscriptionSchema.virtual('daysRemaining').get(function() {
  if (this.status === 'expired' || this.status === 'cancelled') return 0;
  const now = new Date();
  const end = new Date(this.endDate);
  const diffTime = end - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for calculating effective price (after discount and tax)
subscriptionSchema.virtual('effectivePrice').get(function() {
  let price = this.basePrice;
  
  // Apply discount
  if (this.discount.percentage > 0) {
    price = price * (1 - this.discount.percentage / 100);
  }
  if (this.discount.amount > 0) {
    price = Math.max(0, price - this.discount.amount);
  }
  
  // Apply tax
  if (this.tax.percentage > 0) {
    price = price * (1 + this.tax.percentage / 100);
  }
  if (this.tax.amount > 0) {
    price = price + this.tax.amount;
  }
  
  return Math.round(price * 100) / 100; // Round to 2 decimal places
});

// Virtual for subscription duration in months
subscriptionSchema.virtual('durationInMonths').get(function() {
  const start = new Date(this.startDate);
  const end = new Date(this.endDate);
  const diffTime = end - start;
  const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
  return diffMonths;
});

// Method to check if subscription is expiring soon (within specified days)
subscriptionSchema.methods.isExpiringSoon = function(days = 10) {
  if (this.status !== 'active') return false;
  const now = new Date();
  const end = new Date(this.endDate);
  const diffTime = end - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= days && diffDays > 0;
};

// Method to check if subscription is expired
subscriptionSchema.methods.isExpired = function() {
  return new Date() > new Date(this.endDate);
};

// Method to check if subscription is in grace period
subscriptionSchema.methods.isInGracePeriod = function() {
  if (!this.isExpired()) return false;
  const now = new Date();
  const graceEnd = new Date(this.endDate);
  graceEnd.setDate(graceEnd.getDate() + this.gracePeriodDays);
  return now <= graceEnd;
};

// Method to calculate next renewal date
subscriptionSchema.methods.calculateNextRenewalDate = function() {
  const currentEnd = new Date(this.endDate);
  let nextRenewal = new Date(currentEnd);
  
  switch (this.billingCycle) {
    case 'monthly':
      nextRenewal.setMonth(nextRenewal.getMonth() + 1);
      break;
    case 'quarterly':
      nextRenewal.setMonth(nextRenewal.getMonth() + 3);
      break;
    case 'yearly':
      nextRenewal.setFullYear(nextRenewal.getFullYear() + 1);
      break;
  }
  
  return nextRenewal;
};

// Method to renew subscription
subscriptionSchema.methods.renew = function() {
  const nextEnd = this.calculateNextRenewalDate();
  this.endDate = nextEnd;
  this.nextBillingDate = nextEnd;
  this.lastBillingDate = new Date();
  this.renewalCount += 1;
  this.status = 'active';
  return this.save();
};

// Static method to find expiring subscriptions
subscriptionSchema.statics.findExpiring = function(days = 10) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  
  return this.find({
    status: 'active',
    endDate: { $lte: futureDate, $gte: new Date() }
  }).populate('clientId packageId');
};

// Static method to find expired subscriptions
subscriptionSchema.statics.findExpired = function() {
  return this.find({
    status: { $in: ['active', 'pending_payment'] },
    endDate: { $lt: new Date() }
  }).populate('clientId packageId');
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
