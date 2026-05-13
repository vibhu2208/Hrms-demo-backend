const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema({
  packageCode: {
    type: String,
    unique: true,
    sparse: true
  },
  name: {
    type: String,
    required: [true, 'Package name is required'],
    trim: true,
    unique: true
  },
  description: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['starter', 'professional', 'enterprise', 'custom'],
    required: true
  },
  pricing: {
    monthly: {
      type: Number,
      required: true
    },
    quarterly: {
      type: Number
    },
    yearly: {
      type: Number
    },
    currency: {
      type: String,
      default: 'USD'
    }
  },
  features: {
    maxEmployees: {
      type: Number,
      required: true
    },
    maxAdmins: {
      type: Number,
      default: 2
    },
    storageLimit: {
      type: Number, // in GB
      default: 10
    },
    customBranding: {
      type: Boolean,
      default: false
    },
    apiAccess: {
      type: Boolean,
      default: false
    },
    advancedReporting: {
      type: Boolean,
      default: false
    },
    multiLocation: {
      type: Boolean,
      default: false
    },
    integrations: {
      type: Boolean,
      default: false
    }
  },
  includedModules: [{
    type: String,
    enum: ['hr', 'payroll', 'timesheet', 'attendance', 'recruitment', 'performance', 'assets', 'compliance']
  }],
  addOnModules: [{
    module: {
      type: String,
      enum: ['hr', 'payroll', 'timesheet', 'attendance', 'recruitment', 'performance', 'assets', 'compliance']
    },
    price: Number
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isPopular: {
    type: Boolean,
    default: false
  },
  trialDays: {
    type: Number,
    default: 14
  }
}, {
  timestamps: true
});

// Generate package code before saving
packageSchema.pre('save', async function(next) {
  if (!this.packageCode) {
    const count = await mongoose.model('Package').countDocuments();
    this.packageCode = `PKG${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

// Generate package code for insertMany operations
packageSchema.pre('insertMany', async function(next, docs) {
  const count = await mongoose.model('Package').countDocuments();
  docs.forEach((doc, index) => {
    if (!doc.packageCode) {
      doc.packageCode = `PKG${String(count + index + 1).padStart(3, '0')}`;
    }
  });
  next();
});

// Index for better query performance
packageSchema.index({ type: 1, isActive: 1 });

module.exports = mongoose.model('Package', packageSchema);
