const mongoose = require('mongoose');

/**
 * Leave Balance Model
 * Tracks leave balances for employees across different leave types
 * @module models/LeaveBalance
 */
const leaveBalanceSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  year: {
    type: Number,
    required: true
  },
  leaveType: {
    type: String,
    enum: ['sick', 'casual', 'earned', 'maternity', 'paternity', 'unpaid', 'compensatory'],
    required: true
  },
  totalAllotted: {
    type: Number,
    required: true,
    default: 0
  },
  used: {
    type: Number,
    default: 0,
    min: 0
  },
  pending: {
    type: Number,
    default: 0,
    min: 0
  },
  remaining: {
    type: Number,
    default: 0,
    min: 0
  },
  carriedForward: {
    type: Number,
    default: 0,
    min: 0
  },
  lapsed: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

// Calculate remaining leaves before saving
leaveBalanceSchema.pre('save', function(next) {
  this.remaining = this.totalAllotted + this.carriedForward - this.used - this.pending;
  next();
});

// Compound index for employee, year, and leave type
leaveBalanceSchema.index({ employee: 1, year: 1, leaveType: 1 }, { unique: true });

module.exports = mongoose.model('LeaveBalance', leaveBalanceSchema);
