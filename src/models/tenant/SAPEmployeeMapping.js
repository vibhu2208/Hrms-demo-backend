/**
 * SAP Employee Mapping Model - Stored in tenant database
 * Maps HRMS employees to SAP employee records
 */

const mongoose = require('mongoose');

const sapEmployeeMappingSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  employeeEmail: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  sapEmployeeId: {
    type: String,
    required: true,
    index: true
  },
  sapPersonnelNumber: {
    type: String,
    index: true
  },
  lastSyncDate: {
    type: Date,
    index: true
  },
  syncStatus: {
    type: String,
    enum: ['synced', 'pending', 'failed', 'conflict'],
    default: 'pending',
    index: true
  },
  lastSyncDirection: {
    type: String,
    enum: ['hrms_to_sap', 'sap_to_hrms', 'bidirectional']
  },
  conflictFields: [{
    field: String,
    hrmsValue: mongoose.Schema.Types.Mixed,
    sapValue: mongoose.Schema.Types.Mixed,
    resolution: {
      type: String,
      enum: ['pending', 'hrms_wins', 'sap_wins', 'manual'],
      default: 'pending'
    }
  }],
  syncHistory: [{
    syncDate: Date,
    direction: String,
    status: String,
    recordsUpdated: Number,
    errors: [String]
  }]
}, {
  timestamps: true
});

// Indexes
sapEmployeeMappingSchema.index({ employeeId: 1 }, { unique: true });
sapEmployeeMappingSchema.index({ sapEmployeeId: 1 }, { unique: true });
sapEmployeeMappingSchema.index({ employeeEmail: 1 });
sapEmployeeMappingSchema.index({ syncStatus: 1, lastSyncDate: 1 });

module.exports = sapEmployeeMappingSchema;


