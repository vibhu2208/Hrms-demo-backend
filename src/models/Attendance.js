const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  checkIn: {
    type: Date
  },
  checkOut: {
    type: Date
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'half-day', 'on-leave', 'holiday', 'weekend', 'late', 'early-departure'],
    default: 'present'
  },
  workHours: {
    type: Number,
    default: 0
  },
  overtime: {
    type: Number,
    default: 0
  },
  lateBy: {
    type: Number, // in minutes
    default: 0
  },
  earlyDepartureBy: {
    type: Number, // in minutes
    default: 0
  },
  breaks: [{
    startTime: Date,
    endTime: Date,
    duration: Number // in minutes
  }],
  totalBreakTime: {
    type: Number, // in minutes
    default: 0
  },
  notes: {
    type: String
  },
  location: {
    type: String,
    enum: ['office', 'remote', 'field', 'client-site'],
    default: 'office'
  },
  ipAddress: {
    type: String
  },
  device: {
    type: String
  },
  isRegularized: {
    type: Boolean,
    default: false
  },
  regularizationReason: {
    type: String
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Create compound index for employee and date
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
