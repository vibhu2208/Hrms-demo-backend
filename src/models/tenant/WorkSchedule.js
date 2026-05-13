/**
 * Work Schedule Model - Stored in tenant database
 * Daily work schedules for specific dates
 */

const mongoose = require('mongoose');

const workScheduleSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: [true, 'Schedule date is required']
  },
  shiftTemplate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShiftTemplate',
    required: [true, 'Shift template is required']
  },
  location: {
    type: String,
    required: [true, 'Location is required'],
    trim: true
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  isHoliday: {
    type: Boolean,
    default: false
  },
  holidayName: {
    type: String,
    trim: true
  },
  isWeekend: {
    type: Boolean,
    default: false
  },
  notes: {
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
workScheduleSchema.index({ date: 1, location: 1 });
workScheduleSchema.index({ date: 1, department: 1 });
workScheduleSchema.index({ shiftTemplate: 1 });

module.exports = workScheduleSchema;


