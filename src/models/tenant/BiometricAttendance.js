/**
 * Biometric Attendance Model - Stored in tenant database
 * Raw attendance data pulled from biometric devices
 */

const mongoose = require('mongoose');

const biometricAttendanceSchema = new mongoose.Schema({
  employeeCode: {
    type: String,
    required: [true, 'Employee code is required'],
    index: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  deviceId: {
    type: String,
    required: true,
    index: true
  },
  deviceName: {
    type: String
  },
  checkIn: {
    type: Date,
    required: true,
    index: true
  },
  checkOut: {
    type: Date,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['check_in', 'check_out', 'both'],
    default: 'check_in'
  },
  workHours: {
    type: Number, // in hours
    default: 0
  },
  isProcessed: {
    type: Boolean,
    default: false,
    index: true
  },
  processedAt: {
    type: Date
  },
  processedToAttendanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Attendance'
  },
  rawData: {
    type: mongoose.Schema.Types.Mixed // Store original device data
  },
  syncLogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BiometricSyncLog'
  }
}, {
  timestamps: true
});

// Calculate work hours if both check-in and check-out exist
biometricAttendanceSchema.pre('save', function(next) {
  if (this.checkIn && this.checkOut) {
    const diffMs = this.checkOut - this.checkIn;
    this.workHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
    this.status = 'both';
  } else if (this.checkIn) {
    this.status = 'check_in';
  } else if (this.checkOut) {
    this.status = 'check_out';
  }
  next();
});

// Indexes for efficient queries
biometricAttendanceSchema.index({ employeeCode: 1, date: 1 });
biometricAttendanceSchema.index({ date: 1, isProcessed: 1 });
biometricAttendanceSchema.index({ deviceId: 1, date: 1 });
biometricAttendanceSchema.index({ employeeId: 1, date: 1 });

// Compound unique index to prevent duplicates
biometricAttendanceSchema.index(
  { employeeCode: 1, deviceId: 1, checkIn: 1 },
  { unique: true }
);

module.exports = biometricAttendanceSchema;


