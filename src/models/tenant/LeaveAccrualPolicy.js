/**
 * Leave Accrual Policy Model - Stored in tenant database
 * Configurable accrual policies for different leave types
 */

const mongoose = require('mongoose');

const leaveAccrualPolicySchema = new mongoose.Schema({
  leaveType: {
    type: String,
    required: [true, 'Leave type is required'],
    enum: ['Personal Leave', 'Sick Leave', 'Casual Leave', 'Comp Offs', 'Floater Leave', 'Marriage Leave', 'Maternity Leave', 'Paternity Leave', 'Unpaid Leave'],
    unique: true
  },
  accrualFrequency: {
    type: String,
    enum: ['monthly', 'yearly', 'quarterly', 'one-time'],
    required: [true, 'Accrual frequency is required'],
    default: 'monthly'
  },
  accrualAmount: {
    type: Number,
    required: [true, 'Accrual amount is required'],
    min: 0
  },
  yearlyAllocation: {
    type: Number,
    min: 0
  },
  proRataEnabled: {
    type: Boolean,
    default: true
  },
  proRataCalculation: {
    type: String,
    enum: ['calendar-days', 'working-days', 'months'],
    default: 'calendar-days'
  },
  carryForwardEnabled: {
    type: Boolean,
    default: false
  },
  maxCarryForward: {
    type: Number,
    default: 0,
    min: 0
  },
  carryForwardExpiry: {
    type: Number, // in months from year-end
    default: 0 // 0 means no expiry
  },
  maxAccumulation: {
    type: Number, // Maximum total leaves that can be accumulated
    default: 0 // 0 means no limit
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
  departments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  }],
  designations: [String],
  locations: [String],
  isActive: {
    type: Boolean,
    default: true
  },
  accrualDay: {
    type: Number, // Day of month for monthly accrual (1-31)
    default: 1,
    min: 1,
    max: 31
  },
  accrualMonth: {
    type: Number, // Month for yearly accrual (1-12)
    min: 1,
    max: 12
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
leaveAccrualPolicySchema.index({ leaveType: 1 }, { unique: true });
leaveAccrualPolicySchema.index({ isActive: 1 });
leaveAccrualPolicySchema.index({ applicableFrom: 1 });

module.exports = leaveAccrualPolicySchema;


