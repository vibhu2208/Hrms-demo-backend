const mongoose = require('mongoose');

const clientPackageSchema = new mongoose.Schema({
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
    enum: ['active', 'expired', 'suspended', 'trial', 'cancelled'],
    default: 'active'
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'quarterly', 'yearly'],
    default: 'monthly'
  },
  customPrice: {
    type: Number,
    default: null // If null, use package default price
  },
  currency: {
    type: String,
    default: 'USD'
  },
  autoRenew: {
    type: Boolean,
    default: false
  },
  trialDays: {
    type: Number,
    default: 0
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
    reason: String
  },
  paymentHistory: [{
    date: {
      type: Date,
      default: Date.now
    },
    amount: Number,
    currency: String,
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    transactionId: String,
    paymentMethod: String,
    notes: String
  }],
  usage: {
    totalEmployees: {
      type: Number,
      default: 0
    },
    totalAdmins: {
      type: Number,
      default: 0
    },
    storageUsed: {
      type: Number, // in GB
      default: 0
    },
    apiCallsThisMonth: {
      type: Number,
      default: 0
    },
    lastActivity: Date
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

// Indexes for better query performance
clientPackageSchema.index({ clientId: 1, status: 1 });
clientPackageSchema.index({ packageId: 1, status: 1 });
clientPackageSchema.index({ endDate: 1, status: 1 });
clientPackageSchema.index({ startDate: 1, endDate: 1 });

// Virtual for calculating days remaining
clientPackageSchema.virtual('daysRemaining').get(function() {
  if (this.status === 'expired' || this.status === 'cancelled') return 0;
  const now = new Date();
  const end = new Date(this.endDate);
  const diffTime = end - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for calculating total paid amount
clientPackageSchema.virtual('totalPaid').get(function() {
  return this.paymentHistory
    .filter(payment => payment.status === 'completed')
    .reduce((total, payment) => total + payment.amount, 0);
});

// Pre-save middleware to set end date based on billing cycle
clientPackageSchema.pre('save', function(next) {
  if (this.isNew && !this.endDate) {
    const start = new Date(this.startDate);
    let end = new Date(start);
    
    switch (this.billingCycle) {
      case 'monthly':
        end.setMonth(end.getMonth() + 1);
        break;
      case 'quarterly':
        end.setMonth(end.getMonth() + 3);
        break;
      case 'yearly':
        end.setFullYear(end.getFullYear() + 1);
        break;
    }
    
    this.endDate = end;
  }
  next();
});

// Method to check if package is expiring soon (within 7 days)
clientPackageSchema.methods.isExpiringSoon = function() {
  if (this.status !== 'active') return false;
  const now = new Date();
  const end = new Date(this.endDate);
  const diffTime = end - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= 7 && diffDays > 0;
};

// Method to check if package is expired
clientPackageSchema.methods.isExpired = function() {
  return new Date() > new Date(this.endDate);
};

// Method to calculate effective price (considering discounts)
clientPackageSchema.methods.getEffectivePrice = function(basePrice) {
  if (this.customPrice) return this.customPrice;
  
  let price = basePrice;
  if (this.discount.percentage > 0) {
    price = price * (1 - this.discount.percentage / 100);
  }
  if (this.discount.amount > 0) {
    price = Math.max(0, price - this.discount.amount);
  }
  
  return price;
};

module.exports = mongoose.model('ClientPackage', clientPackageSchema);
