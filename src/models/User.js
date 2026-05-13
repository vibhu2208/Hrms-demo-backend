const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
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
    required: function() {
      return this.authProvider === 'local';
    },
    minlength: 6,
    select: false
  },
  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  googleId: {
    type: String,
    sparse: true,
    unique: true
  },
  profilePicture: {
    type: String
  },
  firstName: {
    type: String,
    required: false
  },
  lastName: {
    type: String,
    required: false
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'hr', 'manager', 'employee'],
    default: 'employee'
  },
  // Internal Super Admin role for RBAC within Super Admin module
  internalRole: {
    type: String,
    enum: ['super_admin', 'system_manager', 'finance_admin', 'compliance_officer', 'tech_admin', 'viewer'],
    required: function() {
      return this.role === 'superadmin';
    },
    default: function() {
      return this.role === 'superadmin' ? 'super_admin' : undefined;
    }
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: false // Made optional for multi-tenant support
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  isFirstLogin: {
    type: Boolean,
    default: true
  },
  passwordChangedAt: {
    type: Date
  },
  mustChangePassword: {
    type: Boolean,
    default: false
  },
  themePreference: {
    type: String,
    enum: ['light', 'dark', 'blue', 'green', 'purple', 'orange', 'red', 'teal', 'grey', 'custom'],
    default: 'dark'
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
