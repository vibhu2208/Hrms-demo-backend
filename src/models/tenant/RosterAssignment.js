/**
 * Roster Assignment Model - Stored in tenant database
 * Maps employees to work schedules
 */

const mongoose = require('mongoose');

const rosterAssignmentSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Employee ID is required']
  },
  employeeEmail: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  employeeName: {
    type: String,
    required: true
  },
  workScheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkSchedule',
    required: [true, 'Work schedule ID is required']
  },
  shiftTemplateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShiftTemplate',
    required: true
  },
  effectiveDate: {
    type: Date,
    required: [true, 'Effective date is required']
  },
  endDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'cancelled'],
    default: 'active'
  },
  location: {
    type: String,
    required: true
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
rosterAssignmentSchema.index({ employeeId: 1, effectiveDate: 1, endDate: 1 });
rosterAssignmentSchema.index({ employeeEmail: 1, status: 1 });
rosterAssignmentSchema.index({ workScheduleId: 1 });
rosterAssignmentSchema.index({ effectiveDate: 1, endDate: 1 });
rosterAssignmentSchema.index({ status: 1 });

module.exports = rosterAssignmentSchema;


