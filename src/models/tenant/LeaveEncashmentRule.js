/**
 * Leave Encashment Rule Model - Stored in tenant database
 * Configurable rules for leave encashment eligibility and calculation
 */

const mongoose = require('mongoose');

const leaveEncashmentRuleSchema = new mongoose.Schema({
  leaveType: {
    type: String,
    required: [true, 'Leave type is required'],
    enum: ['Personal Leave', 'Sick Leave', 'Casual Leave', 'Comp Offs', 'Floater Leave', 'Marriage Leave', 'Maternity Leave', 'Paternity Leave', 'Unpaid Leave'],
    unique: true
  },
  isEncashable: {
    type: Boolean,
    default: false
  },
  minBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  maxEncashable: {
    type: Number,
    default: 0, // 0 means no limit
    min: 0
  },
  maxEncashablePercentage: {
    type: Number,
    default: 100, // Percentage of available balance
    min: 0,
    max: 100
  },
  calculationMethod: {
    type: String,
    enum: ['basic_salary', 'gross_salary', 'fixed_rate', 'custom'],
    default: 'basic_salary',
    required: true
  },
  ratePerDay: {
    type: Number,
    default: 0 // Used if calculationMethod is 'fixed_rate'
  },
  salaryComponent: {
    type: String, // Which salary component to use (basic, gross, etc.)
    default: 'basic'
  },
  eligibilityCriteria: {
    minServicePeriod: {
      type: Number, // Minimum months of service
      default: 0
    },
    minBalanceAfterEncashment: {
      type: Number, // Minimum balance to maintain after encashment
      default: 0
    },
    maxEncashmentsPerYear: {
      type: Number, // Maximum number of encashments allowed per year
      default: 0 // 0 means no limit
    },
    allowedDepartments: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department'
    }],
    allowedDesignations: [String],
    allowedLocations: [String],
    excludeProbationary: {
      type: Boolean,
      default: false
    },
    excludeContract: {
      type: Boolean,
      default: false
    }
  },
  applicableFrom: {
    type: Date,
    required: true,
    default: Date.now
  },
  applicableTo: {
    type: String,
    enum: ['all', 'specific-departments', 'specific-designations', 'specific-locations'],
    default: 'all'
  },
  requiresApproval: {
    type: Boolean,
    default: true
  },
  approvalLevels: {
    type: Number,
    default: 1,
    min: 1
  },
  isActive: {
    type: Boolean,
    default: true
  },
  description: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
leaveEncashmentRuleSchema.index({ leaveType: 1 }, { unique: true });
leaveEncashmentRuleSchema.index({ isActive: 1 });
leaveEncashmentRuleSchema.index({ applicableFrom: 1 });

module.exports = leaveEncashmentRuleSchema;


