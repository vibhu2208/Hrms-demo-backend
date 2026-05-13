const mongoose = require('mongoose');

/**
 * Biometric Sync Log Model
 * Tracks sync operations for biometric devices
 * Stored in global database
 */
const biometricSyncLogSchema = new mongoose.Schema({
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BiometricDevice',
    required: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  syncType: {
    type: String,
    enum: ['employee_push', 'attendance_pull', 'full_sync', 'manual'],
    required: true
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'partial'],
    required: true
  },
  recordsCount: {
    type: Number,
    default: 0
  },
  successCount: {
    type: Number,
    default: 0
  },
  failedCount: {
    type: Number,
    default: 0
  },
  errorMessage: {
    type: String
  },
  errorDetails: {
    type: mongoose.Schema.Types.Mixed
  },
  startTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  endTime: {
    type: Date
  },
  duration: {
    type: Number // in milliseconds
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Calculate duration before saving
biometricSyncLogSchema.pre('save', function(next) {
  if (this.endTime && this.startTime) {
    this.duration = this.endTime - this.startTime;
  }
  next();
});

// Indexes
biometricSyncLogSchema.index({ deviceId: 1, createdAt: -1 });
biometricSyncLogSchema.index({ companyId: 1, createdAt: -1 });
biometricSyncLogSchema.index({ syncType: 1, status: 1 });
biometricSyncLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BiometricSyncLog', biometricSyncLogSchema);


