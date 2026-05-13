const mongoose = require('mongoose');

/**
 * Biometric Device Model
 * Stores device registration and configuration
 * Stored in global database (shared across tenants)
 */
const biometricDeviceSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: [true, 'Device ID is required'],
    unique: true,
    trim: true
  },
  deviceName: {
    type: String,
    required: [true, 'Device name is required'],
    trim: true
  },
  deviceType: {
    type: String,
    required: [true, 'Device type is required'],
    enum: ['ZKTeco', 'eSSL', 'RealTime', 'Pegasus', 'Other'],
    default: 'ZKTeco'
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  location: {
    type: String,
    required: [true, 'Location is required'],
    trim: true
  },
  ipAddress: {
    type: String,
    required: [true, 'IP address is required'],
    match: [/^(\d{1,3}\.){3}\d{1,3}$/, 'Invalid IP address format']
  },
  port: {
    type: Number,
    required: true,
    default: 4370,
    min: 1,
    max: 65535
  },
  serialNumber: {
    type: String,
    trim: true
  },
  username: {
    type: String,
    default: 'admin'
  },
  password: {
    type: String,
    required: true,
    select: false // Don't return password by default
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance', 'error'],
    default: 'inactive'
  },
  lastSync: {
    type: Date
  },
  lastSyncStatus: {
    type: String,
    enum: ['success', 'failed', 'partial'],
    default: 'success'
  },
  lastError: {
    type: String
  },
  syncFrequency: {
    type: Number, // in minutes
    default: 15,
    min: 1
  },
  totalEmployees: {
    type: Number,
    default: 0
  },
  totalAttendanceRecords: {
    type: Number,
    default: 0
  },
  configuration: {
    timezone: {
      type: String,
      default: 'Asia/Kolkata'
    },
    dateFormat: {
      type: String,
      default: 'YYYY-MM-DD'
    },
    timeFormat: {
      type: String,
      enum: ['12h', '24h'],
      default: '24h'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
biometricDeviceSchema.index({ companyId: 1, status: 1 });
biometricDeviceSchema.index({ deviceId: 1 }, { unique: true });
biometricDeviceSchema.index({ ipAddress: 1, port: 1 });
biometricDeviceSchema.index({ location: 1 });

module.exports = mongoose.model('BiometricDevice', biometricDeviceSchema);


