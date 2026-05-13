const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  clientCode: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: [true, 'Client name is required'],
    trim: true
  },
  companyName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  contactPerson: {
    name: String,
    designation: String,
    email: String,
    phone: String
  },
  contractDetails: {
    startDate: Date,
    endDate: Date,
    contractValue: Number,
    currency: {
      type: String,
      default: 'USD'
    },
    paymentTerms: String,
    contractDocument: String
  },
  billingType: {
    type: String,
    enum: ['per-day', 'per-month', 'fte', 'fixed'],
    default: 'per-month'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  industry: String,
  website: String,
  notes: String,
  isActive: {
    type: Boolean,
    default: true
  },
  // Super Admin specific fields
  subscription: {
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Package'
    },
    startDate: Date,
    endDate: Date,
    status: {
      type: String,
      enum: ['active', 'expired', 'suspended', 'trial'],
      default: 'trial'
    },
    autoRenew: {
      type: Boolean,
      default: false
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly'],
      default: 'monthly'
    }
  },
  enabledModules: [{
    type: String,
    enum: ['hr', 'payroll', 'timesheet', 'attendance', 'recruitment', 'performance', 'assets', 'compliance']
  }],
  settings: {
    maxEmployees: {
      type: Number,
      default: 50
    },
    maxAdmins: {
      type: Number,
      default: 2
    },
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
      type: Number,
      default: 0
    },
    lastActivity: Date
  }
}, {
  timestamps: true
});

// Generate client code before saving
clientSchema.pre('save', async function(next) {
  if (!this.clientCode) {
    const count = await mongoose.model('Client').countDocuments();
    this.clientCode = `CLT${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Client', clientSchema);
