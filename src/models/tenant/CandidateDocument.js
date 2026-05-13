/**
 * Candidate Document Model
 * Tracks all documents uploaded by candidates during onboarding
 */

const mongoose = require('mongoose');

const candidateDocumentSchema = new mongoose.Schema({
  // Link to onboarding record
  onboardingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Onboarding',
    required: true,
    index: true
  },
  
  // Candidate details (denormalized)
  candidateEmail: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  candidateName: {
    type: String,
    required: true
  },
  
  // Document details
  documentType: {
    type: String,
    required: true,
    enum: [
      'educational_certificate',
      'aadhaar_card',
      'pan_card',
      'experience_letter',
      'resume',
      'photograph',
      'address_proof',
      'bank_details',
      'passport',
      'training_certificate',
      'other'
    ]
  },
  documentName: {
    type: String,
    required: true
  },
  
  // File information
  fileName: {
    type: String,
    required: true
  },
  originalFileName: {
    type: String,
    required: true
  },
  filePath: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String
  },
  storageProvider: {
    type: String,
    enum: ['local', 's3'],
    default: 'local',
    index: true
  },
  s3Key: {
    type: String
  },
  s3Bucket: {
    type: String
  },
  fileSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  
  // Upload tracking
  uploadedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  uploadToken: {
    type: String,
    required: true
  },
  uploadIp: {
    type: String
  },
  uploadUserAgent: {
    type: String
  },
  
  // Verification status
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'unverified', 'resubmitted'],
    default: 'pending',
    index: true
  },
  
  // Verification details
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verifiedByName: {
    type: String
  },
  verifiedAt: {
    type: Date
  },
  verificationRemarks: {
    type: String
  },
  
  // Unverification details
  unverifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  unverifiedByName: {
    type: String
  },
  unverifiedAt: {
    type: Date
  },
  unverificationReason: {
    type: String
  },
  
  // Re-submission tracking
  isResubmission: {
    type: Boolean,
    default: false
  },
  originalDocumentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CandidateDocument'
  },
  resubmissionCount: {
    type: Number,
    default: 0
  },
  
  // Document metadata
  isMandatory: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Audit trail
  history: [{
    action: {
      type: String,
      enum: ['uploaded', 'verified', 'unverified', 'resubmitted', 'deleted']
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    performedByName: String,
    remarks: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    metadata: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true
});

// Add to history
candidateDocumentSchema.methods.addToHistory = function(action, performedBy, performedByName, remarks, metadata) {
  this.history.push({
    action,
    performedBy,
    performedByName,
    remarks,
    metadata,
    timestamp: new Date()
  });
};

// Indexes for performance
candidateDocumentSchema.index({ onboardingId: 1, documentType: 1 });
candidateDocumentSchema.index({ candidateEmail: 1, verificationStatus: 1 });
candidateDocumentSchema.index({ verificationStatus: 1, uploadedAt: -1 });

module.exports = candidateDocumentSchema;
