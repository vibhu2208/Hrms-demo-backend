const mongoose = require('mongoose');

const subscriptionLogSchema = new mongoose.Schema({
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
  action: {
    type: String,
    enum: [
      'created',
      'updated',
      'renewed',
      'cancelled',
      'suspended',
      'reactivated',
      'expired',
      'payment_received',
      'payment_failed',
      'invoice_generated',
      'reminder_sent',
      'grace_period_started',
      'auto_renewed',
      'manually_renewed',
      'downgraded',
      'upgraded',
      'discount_applied',
      'discount_removed'
    ],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  previousValues: {
    type: mongoose.Schema.Types.Mixed // Store previous state
  },
  newValues: {
    type: mongoose.Schema.Types.Mixed // Store new state
  },
  metadata: {
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice'
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment'
    },
    amount: Number,
    billingCycle: String,
    reason: String,
    notes: String,
    automaticAction: {
      type: Boolean,
      default: false
    }
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  performedByRole: {
    type: String,
    enum: ['superadmin', 'finance_admin', 'system_manager', 'compliance_officer', 'system'],
    required: true
  },
  ipAddress: String,
  userAgent: String,
  timestamp: {
    type: Date,
    default: Date.now
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['subscription', 'billing', 'payment', 'renewal', 'cancellation', 'system'],
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
subscriptionLogSchema.index({ subscriptionId: 1, timestamp: -1 });
subscriptionLogSchema.index({ clientId: 1, timestamp: -1 });
subscriptionLogSchema.index({ action: 1, timestamp: -1 });
subscriptionLogSchema.index({ performedBy: 1, timestamp: -1 });
subscriptionLogSchema.index({ category: 1, timestamp: -1 });
subscriptionLogSchema.index({ severity: 1, timestamp: -1 });
subscriptionLogSchema.index({ timestamp: -1 });

// Virtual for formatted timestamp
subscriptionLogSchema.virtual('formattedTimestamp').get(function() {
  return this.timestamp.toLocaleString();
});

// Virtual for checking if action is critical
subscriptionLogSchema.virtual('isCritical').get(function() {
  return ['cancelled', 'suspended', 'expired', 'payment_failed'].includes(this.action);
});

// Static method to log subscription action
subscriptionLogSchema.statics.logAction = function(data) {
  const {
    subscriptionId,
    clientId,
    action,
    description,
    previousValues,
    newValues,
    metadata,
    performedBy,
    performedByRole,
    ipAddress,
    userAgent,
    severity,
    category
  } = data;
  
  return this.create({
    subscriptionId,
    clientId,
    action,
    description,
    previousValues,
    newValues,
    metadata: metadata || {},
    performedBy,
    performedByRole,
    ipAddress,
    userAgent,
    severity: severity || 'medium',
    category: category || 'subscription'
  });
};

// Static method to get subscription timeline
subscriptionLogSchema.statics.getSubscriptionTimeline = function(subscriptionId) {
  return this.find({ subscriptionId })
    .populate('performedBy', 'email name')
    .populate('metadata.invoiceId', 'invoiceNumber amount.total')
    .populate('metadata.paymentId', 'paymentId amount status')
    .sort({ timestamp: -1 });
};

// Static method to get client activity logs
subscriptionLogSchema.statics.getClientActivity = function(clientId, limit = 50) {
  return this.find({ clientId })
    .populate('subscriptionId', 'subscriptionCode status')
    .populate('performedBy', 'email name')
    .sort({ timestamp: -1 })
    .limit(limit);
};

// Static method to get critical actions
subscriptionLogSchema.statics.getCriticalActions = function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.find({
    timestamp: { $gte: startDate },
    $or: [
      { severity: { $in: ['high', 'critical'] } },
      { action: { $in: ['cancelled', 'suspended', 'expired', 'payment_failed'] } }
    ]
  })
  .populate('subscriptionId', 'subscriptionCode')
  .populate('clientId', 'name companyName')
  .populate('performedBy', 'email name')
  .sort({ timestamp: -1 });
};

// Static method to get action statistics
subscriptionLogSchema.statics.getActionStats = function(startDate, endDate) {
  const matchStage = {
    timestamp: {
      $gte: startDate || new Date(new Date().getFullYear(), 0, 1),
      $lte: endDate || new Date()
    }
  };
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

// Static method to get user activity stats
subscriptionLogSchema.statics.getUserActivityStats = function(startDate, endDate) {
  const matchStage = {
    timestamp: {
      $gte: startDate || new Date(new Date().getFullYear(), 0, 1),
      $lte: endDate || new Date()
    }
  };
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$performedBy',
        actions: { $sum: 1 },
        categories: { $addToSet: '$category' },
        lastActivity: { $max: '$timestamp' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $unwind: '$user'
    },
    {
      $project: {
        actions: 1,
        categories: 1,
        lastActivity: 1,
        userName: '$user.name',
        userEmail: '$user.email'
      }
    },
    {
      $sort: { actions: -1 }
    }
  ]);
};

// Static method to get daily activity summary
subscriptionLogSchema.statics.getDailyActivitySummary = function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' }
        },
        totalActions: { $sum: 1 },
        criticalActions: {
          $sum: {
            $cond: [
              { $in: ['$action', ['cancelled', 'suspended', 'expired', 'payment_failed']] },
              1,
              0
            ]
          }
        },
        categories: { $addToSet: '$category' }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
    }
  ]);
};

// Method to mark log as reviewed
subscriptionLogSchema.methods.markAsReviewed = function(reviewedBy) {
  this.metadata.reviewedBy = reviewedBy;
  this.metadata.reviewedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('SubscriptionLog', subscriptionLogSchema);
