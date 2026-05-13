const mongoose = require('mongoose');

/**
 * SAP Sync Log Model
 * Tracks SAP synchronization operations
 * Stored in global database
 */
const sapSyncLogSchema = new mongoose.Schema({
  connectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SAPConnection',
    required: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  syncType: {
    type: String,
    enum: ['employee_master', 'leave_balance', 'attendance', 'full_sync', 'manual'],
    required: true
  },
  entityType: {
    type: String,
    enum: ['employee', 'leave', 'attendance', 'mixed'],
    required: true
  },
  direction: {
    type: String,
    enum: ['hrms_to_sap', 'sap_to_hrms', 'bidirectional'],
    default: 'hrms_to_sap'
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
  conflicts: [{
    entityId: String,
    entityType: String,
    hrmsValue: mongoose.Schema.Types.Mixed,
    sapValue: mongoose.Schema.Types.Mixed,
    conflictField: String,
    resolution: {
      type: String,
      enum: ['pending', 'hrms_wins', 'sap_wins', 'manual'],
      default: 'pending'
    }
  }],
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
sapSyncLogSchema.pre('save', function(next) {
  if (this.endTime && this.startTime) {
    this.duration = this.endTime - this.startTime;
  }
  next();
});

// Indexes
sapSyncLogSchema.index({ connectionId: 1, createdAt: -1 });
sapSyncLogSchema.index({ companyId: 1, createdAt: -1 });
sapSyncLogSchema.index({ syncType: 1, status: 1 });
sapSyncLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SAPSyncLog', sapSyncLogSchema);


