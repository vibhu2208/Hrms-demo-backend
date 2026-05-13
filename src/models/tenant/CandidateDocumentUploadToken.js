/**
 * Candidate Document Upload Token Model
 * Generates secure, time-bound tokens for public document upload portal
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

const candidateDocumentUploadTokenSchema = new mongoose.Schema({
  // Link to onboarding record
  onboardingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Onboarding',
    required: true,
    index: true
  },
  
  // Candidate details (denormalized for quick access)
  candidateId: {
    type: String,
    required: true
  },
  candidateName: {
    type: String,
    required: true
  },
  candidateEmail: {
    type: String,
    required: true,
    lowercase: true
  },
  position: {
    type: String,
    required: true
  },
  
  // Secure token
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Token validity
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  
  // Usage tracking
  accessCount: {
    type: Number,
    default: 0
  },
  lastAccessedAt: {
    type: Date
  },
  
  // Document submission tracking
  documentsSubmitted: {
    type: Boolean,
    default: false
  },
  firstSubmissionAt: {
    type: Date
  },
  lastSubmissionAt: {
    type: Date
  },
  
  // Re-submission tracking
  resubmissionRequired: {
    type: Boolean,
    default: false
  },
  resubmissionRequestedAt: {
    type: Date
  },
  resubmissionReason: {
    type: String
  },
  rejectedDocuments: [{
    documentType: String,
    reason: String,
    rejectedAt: Date
  }],
  
  // Audit trail
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ipAddresses: [{
    ip: String,
    accessedAt: Date,
    userAgent: String
  }],
  
  // Revocation
  revokedAt: {
    type: Date
  },
  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  revocationReason: {
    type: String
  }
}, {
  timestamps: true
});

// Generate secure token
candidateDocumentUploadTokenSchema.statics.generateToken = function() {
  return crypto.randomBytes(32).toString('hex');
};

// Check if token is valid
candidateDocumentUploadTokenSchema.methods.isValid = function() {
  if (!this.isActive) return false;
  if (this.revokedAt) return false;
  return true;
};

// Record access
candidateDocumentUploadTokenSchema.methods.recordAccess = async function(ip, userAgent) {
  this.accessCount += 1;
  this.lastAccessedAt = new Date();
  this.ipAddresses.push({
    ip,
    accessedAt: new Date(),
    userAgent
  });
  await this.save();
};

// Indexes for performance
candidateDocumentUploadTokenSchema.index({ token: 1, isActive: 1 });
candidateDocumentUploadTokenSchema.index({ expiresAt: 1 });
candidateDocumentUploadTokenSchema.index({ candidateEmail: 1 });

module.exports = candidateDocumentUploadTokenSchema;
