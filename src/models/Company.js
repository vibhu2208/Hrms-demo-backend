const mongoose = require('mongoose');

/**
 * Company Model - Global collection for all client companies
 * This is stored in the main database and tracks all tenant companies
 */
const companySchema = new mongoose.Schema({
  companyCode: {
    type: String,
    unique: true,
    sparse: true // Allows null/undefined until pre-save hook generates it
  },
  companyName: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
    unique: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required']
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  // Database information
  databaseName: {
    type: String,
    unique: true,
    sparse: true // Allows null/undefined until pre-save hook generates it
  },
  databaseStatus: {
    type: String,
    enum: ['provisioning', 'active', 'suspended', 'deleted'],
    default: 'provisioning'
  },
  // Admin user information
  adminUser: {
    email: String,
    userId: {
      type: mongoose.Schema.Types.ObjectId
    },
    createdAt: Date
  },
  // Subscription details
  subscription: {
    plan: {
      type: String,
      enum: ['trial', 'basic', 'professional', 'enterprise'],
      default: 'trial'
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: Date,
    status: {
      type: String,
      enum: ['active', 'expired', 'suspended', 'cancelled'],
      default: 'active'
    },
    maxEmployees: {
      type: Number,
      default: 50
    },
    maxAdmins: {
      type: Number,
      default: 2
    }
  },
  // Enabled modules
  enabledModules: [{
    type: String,
    enum: ['hr', 'payroll', 'timesheet', 'attendance', 'recruitment', 'performance', 'assets', 'compliance']
  }],
  // Company settings
  settings: {
    customBranding: {
      type: Boolean,
      default: false
    },
    apiAccess: {
      type: Boolean,
      default: false
    },
    dataRetentionDays: {
      type: Number,
      default: 365
    }
  },
  // Status and metadata
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Tracking
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastActivity: Date,
  notes: String
}, {
  timestamps: true
});

// Generate company code before saving
companySchema.pre('save', async function(next) {
  try {
    if (!this.companyCode) {
      const count = await this.constructor.countDocuments();
      this.companyCode = `COMP${String(count + 1).padStart(5, '0')}`;
    }
    
    // Generate database name from company name if not set
    if (!this.databaseName) {
      const sanitizedName = this.companyName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
      this.databaseName = `hrms_${sanitizedName}`;
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Index for faster queries
companySchema.index({ companyName: 1 });
companySchema.index({ email: 1 });
companySchema.index({ databaseName: 1 });
companySchema.index({ status: 1 });

module.exports = mongoose.model('Company', companySchema);
