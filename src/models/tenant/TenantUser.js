/**
 * Tenant User Model - Stored in each tenant database (tenant_{companyId})
 * Contains: company_admin, hr_users, manager_users, employees
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const tenantUserSchema = new mongoose.Schema({
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
    sparse: true
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
  // User role within the company
  role: {
    type: String,
    enum: ['company_admin', 'hr', 'manager', 'employee'],
    required: true
  },
  // Employee reference (if applicable)
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee' // Reference to employee in same tenant DB
  },
  // Department (for managers and employees)
  department: {
    type: String,
    trim: true
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  // Designation/Job Title
  designation: {
    type: String,
    trim: true
  },
  // Reporting Manager (email of manager)
  reportingManager: {
    type: String,
    trim: true,
    lowercase: true
  },
  // New RBAC System
  roleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  },
  customPermissions: [{
    permissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Permission'
    },
    scope: {
      type: String,
      enum: ['own', 'team', 'department', 'all'],
      default: 'own'
    },
    grantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    grantedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date
    },
    reason: {
      type: String
    }
  }],

  // Employee-specific fields (for role: 'employee')
  employeeCode: {
    type: String,
    unique: true,
    sparse: true // Allows multiple null values but unique non-null values
  },
  joiningDate: {
    type: Date
  },
  salary: {
    basic: {
      type: Number,
      default: 0
    },
    hra: {
      type: Number,
      default: 0
    },
    allowances: {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      default: 0
    }
  },
  terminatedAt: {
    type: Date
  },
  terminationReason: {
    type: String
  },

  // Legacy Permissions (deprecated - kept for backward compatibility)
  permissions: {
    canManageEmployees: {
      type: Boolean,
      default: false
    },
    canManagePayroll: {
      type: Boolean,
      default: false
    },
    canViewReports: {
      type: Boolean,
      default: false
    },
    canManageSettings: {
      type: Boolean,
      default: false
    },
    canManageRecruitment: {
      type: Boolean,
      default: false
    },
    canManageAttendance: {
      type: Boolean,
      default: false
    },
    canManageLeaves: {
      type: Boolean,
      default: false
    },
    canManageAssets: {
      type: Boolean,
      default: false
    }
  },
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  isFirstLogin: {
    type: Boolean,
    default: true
  },
  mustChangePassword: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  passwordChangedAt: {
    type: Date
  },
  // Theme preference
  themePreference: {
    type: String,
    enum: ['light', 'dark', 'blue', 'green', 'purple', 'orange', 'red', 'teal', 'grey', 'custom'],
    default: 'dark'
  },
  // Created by
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Reference to user in same tenant DB
  }
}, {
  timestamps: true
});

// Hash password before saving
tenantUserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare password
tenantUserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Set default permissions based on role
tenantUserSchema.pre('save', function(next) {
  if (this.isNew) {
    switch (this.role) {
      case 'company_admin':
        this.permissions = {
          canManageEmployees: true,
          canManagePayroll: true,
          canViewReports: true,
          canManageSettings: true,
          canManageRecruitment: true,
          canManageAttendance: true,
          canManageLeaves: true,
          canManageAssets: true
        };
        this.mustChangePassword = false;
        break;
      case 'hr':
        this.permissions = {
          canManageEmployees: true,
          canManagePayroll: false,
          canViewReports: true,
          canManageSettings: false,
          canManageRecruitment: true,
          canManageAttendance: true,
          canManageLeaves: true,
          canManageAssets: false
        };
        break;
      case 'manager':
        this.permissions = {
          canManageEmployees: false,
          canManagePayroll: false,
          canViewReports: true,
          canManageSettings: false,
          canManageRecruitment: false,
          canManageAttendance: true,
          canManageLeaves: true,
          canManageAssets: false
        };
        break;
      case 'employee':
        this.permissions = {
          canManageEmployees: false,
          canManagePayroll: false,
          canViewReports: false,
          canManageSettings: false,
          canManageRecruitment: false,
          canManageAttendance: false,
          canManageLeaves: false,
          canManageAssets: false
        };
        break;
    }
  }
  next();
});

module.exports = tenantUserSchema;
