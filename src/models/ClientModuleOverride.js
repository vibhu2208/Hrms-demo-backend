const mongoose = require('mongoose');

const clientModuleOverrideSchema = new mongoose.Schema({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  clientPackageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClientPackage',
    required: true
  },
  moduleId: {
    type: String,
    required: true,
    enum: ['hr', 'payroll', 'timesheet', 'attendance', 'recruitment', 'performance', 'assets', 'compliance']
  },
  enabled: {
    type: Boolean,
    required: true,
    default: true
  },
  customSettings: {
    // Module-specific custom settings
    maxRecords: Number,
    accessLevel: {
      type: String,
      enum: ['basic', 'advanced', 'premium'],
      default: 'basic'
    },
    features: [{
      name: String,
      enabled: Boolean,
      config: mongoose.Schema.Types.Mixed
    }],
    limits: {
      dailyTransactions: Number,
      monthlyReports: Number,
      storageQuota: Number, // in MB
      apiCalls: Number
    }
  },
  pricing: {
    // Custom pricing for this module if different from package
    additionalCost: {
      type: Number,
      default: 0
    },
    billingType: {
      type: String,
      enum: ['included', 'per_user', 'per_transaction', 'fixed_monthly'],
      default: 'included'
    },
    rate: Number
  },
  usage: {
    // Track usage for this specific module
    activeUsers: {
      type: Number,
      default: 0
    },
    transactionsThisMonth: {
      type: Number,
      default: 0
    },
    storageUsed: {
      type: Number, // in MB
      default: 0
    },
    lastAccessed: Date,
    totalSessions: {
      type: Number,
      default: 0
    }
  },
  restrictions: {
    // Module-specific restrictions
    maxUsers: Number,
    allowedIPs: [String],
    timeRestrictions: {
      startTime: String, // HH:MM format
      endTime: String,   // HH:MM format
      allowedDays: [{
        type: String,
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      }]
    },
    featureRestrictions: [{
      feature: String,
      allowed: Boolean,
      reason: String
    }]
  },
  overrideReason: {
    type: String,
    required: true
  },
  overriddenBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  effectiveFrom: {
    type: Date,
    default: Date.now
  },
  effectiveTo: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  auditTrail: [{
    action: {
      type: String,
      enum: ['created', 'modified', 'enabled', 'disabled', 'deleted'],
      required: true
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    changes: mongoose.Schema.Types.Mixed,
    reason: String
  }]
}, {
  timestamps: true
});

// Compound indexes for better query performance
clientModuleOverrideSchema.index({ clientId: 1, moduleId: 1 });
clientModuleOverrideSchema.index({ clientPackageId: 1, enabled: 1 });
clientModuleOverrideSchema.index({ clientId: 1, enabled: 1, isActive: 1 });
clientModuleOverrideSchema.index({ effectiveFrom: 1, effectiveTo: 1 });

// Ensure only one active override per client-module combination
clientModuleOverrideSchema.index(
  { clientId: 1, moduleId: 1, isActive: 1 },
  { 
    unique: true,
    partialFilterExpression: { isActive: true }
  }
);

// Virtual to check if override is currently effective
clientModuleOverrideSchema.virtual('isCurrentlyEffective').get(function() {
  if (!this.isActive) return false;
  
  const now = new Date();
  const effectiveFrom = new Date(this.effectiveFrom);
  
  if (now < effectiveFrom) return false;
  
  if (this.effectiveTo) {
    const effectiveTo = new Date(this.effectiveTo);
    return now <= effectiveTo;
  }
  
  return true;
});

// Method to add audit trail entry
clientModuleOverrideSchema.methods.addAuditEntry = function(action, performedBy, changes = null, reason = null) {
  this.auditTrail.push({
    action,
    performedBy,
    changes,
    reason,
    timestamp: new Date()
  });
};

// Method to check if module usage is within limits
clientModuleOverrideSchema.methods.isWithinUsageLimits = function() {
  const limits = this.customSettings.limits;
  const usage = this.usage;
  
  if (!limits) return true;
  
  const checks = [];
  
  if (limits.dailyTransactions && usage.transactionsThisMonth) {
    // This is a simplified check - in real implementation, you'd check daily transactions
    checks.push(usage.transactionsThisMonth <= limits.dailyTransactions * 30);
  }
  
  if (limits.storageQuota && usage.storageUsed) {
    checks.push(usage.storageUsed <= limits.storageQuota);
  }
  
  return checks.every(check => check);
};

// Method to calculate additional cost for this module
clientModuleOverrideSchema.methods.calculateAdditionalCost = function() {
  if (this.pricing.billingType === 'included') return 0;
  
  const { billingType, rate } = this.pricing;
  const { activeUsers, transactionsThisMonth } = this.usage;
  
  switch (billingType) {
    case 'per_user':
      return (activeUsers || 0) * (rate || 0);
    case 'per_transaction':
      return (transactionsThisMonth || 0) * (rate || 0);
    case 'fixed_monthly':
      return rate || 0;
    default:
      return this.pricing.additionalCost || 0;
  }
};

// Pre-save middleware to add audit trail
clientModuleOverrideSchema.pre('save', function(next) {
  if (this.isNew) {
    this.addAuditEntry('created', this.overriddenBy, null, this.overrideReason);
  } else if (this.isModified()) {
    const changes = this.modifiedPaths().reduce((acc, path) => {
      acc[path] = {
        old: this.get(path),
        new: this.get(path)
      };
      return acc;
    }, {});
    
    this.addAuditEntry('modified', this.overriddenBy, changes, 'Module override updated');
  }
  
  next();
});

// Static method to get active overrides for a client
clientModuleOverrideSchema.statics.getActiveOverridesForClient = function(clientId) {
  return this.find({
    clientId,
    isActive: true,
    effectiveFrom: { $lte: new Date() },
    $or: [
      { effectiveTo: { $exists: false } },
      { effectiveTo: null },
      { effectiveTo: { $gte: new Date() } }
    ]
  }).populate('overriddenBy approvedBy', 'name email');
};

// Static method to get module usage summary for a client
clientModuleOverrideSchema.statics.getUsageSummaryForClient = function(clientId) {
  return this.aggregate([
    { $match: { clientId: mongoose.Types.ObjectId(clientId), isActive: true } },
    {
      $group: {
        _id: '$clientId',
        totalActiveUsers: { $sum: '$usage.activeUsers' },
        totalTransactions: { $sum: '$usage.transactionsThisMonth' },
        totalStorageUsed: { $sum: '$usage.storageUsed' },
        enabledModules: { $sum: { $cond: ['$enabled', 1, 0] } },
        totalModules: { $sum: 1 },
        additionalCost: { $sum: '$pricing.additionalCost' }
      }
    }
  ]);
};

module.exports = mongoose.model('ClientModuleOverride', clientModuleOverrideSchema);
