/**
 * Approval Delegation Model - Stored in tenant database
 * Tracks delegation of approval authority
 */

const mongoose = require('mongoose');

const approvalDelegationSchema = new mongoose.Schema({
  delegatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Delegator is required'],
    index: true
  },
  delegatorEmail: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  delegateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Delegate is required'],
    index: true
  },
  delegateEmail: {
    type: String,
    required: true,
    lowercase: true
  },
  delegateName: {
    type: String,
    required: true
  },
  entityTypes: [{
    type: String,
    enum: ['leave', 'roster_change', 'profile_update', 'attendance_regularization', 'expense', 'all']
  }],
  startDate: {
    type: Date,
    required: [true, 'Start date is required'],
    index: true
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required'],
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  autoNotify: {
    type: Boolean,
    default: true
  },
  reason: {
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

// Indexes for efficient queries
approvalDelegationSchema.index({ delegatorId: 1, isActive: 1, startDate: 1, endDate: 1 });
approvalDelegationSchema.index({ delegateId: 1, isActive: 1 });
approvalDelegationSchema.index({ startDate: 1, endDate: 1 });

// Check if delegation is currently active
approvalDelegationSchema.methods.isCurrentlyActive = function() {
  const now = new Date();
  return this.isActive && 
         this.startDate <= now && 
         this.endDate >= now;
};

module.exports = approvalDelegationSchema;


