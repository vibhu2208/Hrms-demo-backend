const mongoose = require('mongoose');

const moduleSchema = new mongoose.Schema({
  moduleId: {
    type: String,
    required: true,
    unique: true,
    enum: ['hr', 'payroll', 'timesheet', 'attendance', 'recruitment', 'performance', 'assets', 'compliance']
  },
  name: {
    type: String,
    required: true
  },
  displayName: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['core', 'advanced', 'premium', 'addon'],
    default: 'core'
  },
  version: {
    type: String,
    default: '1.0.0'
  },
  icon: {
    type: String, // Icon name or path
    default: 'package'
  },
  color: {
    type: String, // Hex color code for UI theming
    default: '#3B82F6'
  },
  dependencies: [{
    moduleId: {
      type: String,
      required: true
    },
    version: String,
    required: {
      type: Boolean,
      default: true
    }
  }],
  features: [{
    featureId: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    description: String,
    isCore: {
      type: Boolean,
      default: true
    },
    requiresUpgrade: {
      type: Boolean,
      default: false
    },
    minimumPlan: {
      type: String,
      enum: ['starter', 'professional', 'enterprise'],
      default: 'starter'
    }
  }],
  pricing: {
    basePrice: {
      type: Number,
      default: 0
    },
    billingType: {
      type: String,
      enum: ['included', 'per_user', 'per_transaction', 'fixed_monthly'],
      default: 'included'
    },
    currency: {
      type: String,
      default: 'USD'
    },
    tiers: [{
      name: String,
      description: String,
      price: Number,
      features: [String],
      limits: {
        users: Number,
        transactions: Number,
        storage: Number // in MB
      }
    }]
  },
  limits: {
    defaultMaxUsers: {
      type: Number,
      default: -1 // -1 means unlimited
    },
    defaultMaxTransactions: {
      type: Number,
      default: -1
    },
    defaultStorageQuota: {
      type: Number, // in MB
      default: 1000
    },
    defaultApiCalls: {
      type: Number,
      default: 10000
    }
  },
  configuration: {
    // Default configuration options for the module
    settings: mongoose.Schema.Types.Mixed,
    customFields: [{
      fieldId: String,
      name: String,
      type: {
        type: String,
        enum: ['text', 'number', 'boolean', 'select', 'multiselect', 'date']
      },
      required: Boolean,
      defaultValue: mongoose.Schema.Types.Mixed,
      options: [String] // For select/multiselect types
    }]
  },
  permissions: [{
    permissionId: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    description: String,
    level: {
      type: String,
      enum: ['read', 'write', 'admin', 'owner'],
      default: 'read'
    },
    isDefault: {
      type: Boolean,
      default: false
    }
  }],
  integrations: [{
    name: String,
    type: {
      type: String,
      enum: ['api', 'webhook', 'sync', 'import', 'export']
    },
    description: String,
    endpoint: String,
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  status: {
    type: String,
    enum: ['active', 'deprecated', 'beta', 'maintenance'],
    default: 'active'
  },
  isCore: {
    type: Boolean,
    default: false // Core modules cannot be disabled
  },
  releaseDate: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  documentation: {
    userGuide: String,
    apiDocs: String,
    changelog: String,
    supportContact: String
  },
  metrics: {
    totalInstalls: {
      type: Number,
      default: 0
    },
    activeInstalls: {
      type: Number,
      default: 0
    },
    averageRating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    totalReviews: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
moduleSchema.index({ moduleId: 1 });
moduleSchema.index({ status: 1, category: 1 });
moduleSchema.index({ isCore: 1, status: 1 });

// Virtual for checking if module has dependencies
moduleSchema.virtual('hasDependencies').get(function() {
  return this.dependencies && this.dependencies.length > 0;
});

// Virtual for checking if module is available
moduleSchema.virtual('isAvailable').get(function() {
  return this.status === 'active' || this.status === 'beta';
});

// Method to check if module is compatible with a package type
moduleSchema.methods.isCompatibleWithPackage = function(packageType) {
  // Core modules are available in all packages
  if (this.isCore) return true;
  
  // Check if any features require a specific minimum plan
  const hasRestrictedFeatures = this.features.some(feature => {
    if (!feature.minimumPlan) return false;
    
    const planHierarchy = { starter: 1, professional: 2, enterprise: 3 };
    const requiredLevel = planHierarchy[feature.minimumPlan] || 1;
    const packageLevel = planHierarchy[packageType] || 1;
    
    return requiredLevel > packageLevel;
  });
  
  return !hasRestrictedFeatures;
};

// Method to get available features for a package type
moduleSchema.methods.getAvailableFeaturesForPackage = function(packageType) {
  const planHierarchy = { starter: 1, professional: 2, enterprise: 3 };
  const packageLevel = planHierarchy[packageType] || 1;
  
  return this.features.filter(feature => {
    if (!feature.minimumPlan) return true;
    const requiredLevel = planHierarchy[feature.minimumPlan] || 1;
    return requiredLevel <= packageLevel;
  });
};

// Method to calculate module cost for a specific billing type and usage
moduleSchema.methods.calculateCost = function(billingCycle, userCount = 1, transactionCount = 0) {
  const { basePrice, billingType } = this.pricing;
  
  if (billingType === 'included') return 0;
  
  let cost = basePrice || 0;
  
  switch (billingType) {
    case 'per_user':
      cost = cost * userCount;
      break;
    case 'per_transaction':
      cost = cost * transactionCount;
      break;
    case 'fixed_monthly':
      // Cost remains the same regardless of usage
      break;
  }
  
  // Apply billing cycle multiplier
  switch (billingCycle) {
    case 'quarterly':
      cost = cost * 3 * 0.95; // 5% discount for quarterly
      break;
    case 'yearly':
      cost = cost * 12 * 0.85; // 15% discount for yearly
      break;
  }
  
  return cost;
};

// Static method to get all active modules
moduleSchema.statics.getActiveModules = function() {
  return this.find({ status: 'active' }).sort({ name: 1 });
};

// Static method to get modules by category
moduleSchema.statics.getModulesByCategory = function(category) {
  return this.find({ category, status: 'active' }).sort({ name: 1 });
};

// Static method to get core modules
moduleSchema.statics.getCoreModules = function() {
  return this.find({ isCore: true, status: 'active' }).sort({ name: 1 });
};

// Pre-save middleware to update lastUpdated
moduleSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.lastUpdated = new Date();
  }
  next();
});

module.exports = mongoose.model('Module', moduleSchema);
