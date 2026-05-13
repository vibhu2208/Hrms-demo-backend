/**
 * Official Data Model - Stored in tenant database
 * Stores read-only SAP-maintained employee data
 */

const mongoose = require('mongoose');

const officialDataSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Employee ID is required'],
    unique: true,
    index: true
  },
  employeeEmail: {
    type: String,
    required: true,
    lowercase: true,
    unique: true,
    index: true
  },
  sapPersonnelNumber: {
    type: String,
    trim: true,
    index: true
  },
  fields: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
    // Stores SAP fields like:
    // - employeeCode
    // - costCenter
    // - payrollArea
    // - employmentType
    // - salary
    // - etc.
  },
  sapSyncStatus: {
    type: String,
    enum: ['synced', 'pending', 'failed', 'never_synced'],
    default: 'never_synced',
    index: true
  },
  lastSyncDate: {
    type: Date
  },
  lastSyncError: {
    type: String
  },
  isReadOnly: {
    type: Boolean,
    default: true
  },
  syncFrequency: {
    type: String,
    enum: ['realtime', 'daily', 'weekly', 'monthly', 'manual'],
    default: 'daily'
  }
}, {
  timestamps: true
});

// Indexes
officialDataSchema.index({ sapPersonnelNumber: 1 });
officialDataSchema.index({ sapSyncStatus: 1 });

module.exports = officialDataSchema;


