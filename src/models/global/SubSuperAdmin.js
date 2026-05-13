/**
 * Sub Super Admin Model - Stored in hrms_global database
 * Created by Super Admin with specific module access
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const subSuperAdminSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String
  },
  profilePicture: {
    type: String
  },
  role: {
    type: String,
    default: 'sub_superadmin',
    immutable: true
  },
  // Assigned modules - what this sub admin can access
  assignedModules: [{
    type: String,
    enum: [
      'billing',
      'customer_support',
      'analytics',
      'company_management',
      'subscription_management',
      'user_management',
      'system_configuration',
      'audit_logs',
      'reports'
    ]
  }],
  permissions: {
    canCreateCompanies: {
      type: Boolean,
      default: false
    },
    canDeleteCompanies: {
      type: Boolean,
      default: false
    },
    canManageBilling: {
      type: Boolean,
      default: false
    },
    canViewAllCompanies: {
      type: Boolean,
      default: true
    },
    canManageSubscriptions: {
      type: Boolean,
      default: false
    },
    canAccessAnalytics: {
      type: Boolean,
      default: false
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  passwordChangedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Hash password before saving
subSuperAdminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare password
subSuperAdminSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = subSuperAdminSchema;
