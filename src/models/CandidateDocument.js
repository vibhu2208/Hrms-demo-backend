const mongoose = require('mongoose');

const candidateDocumentSchema = new mongoose.Schema({
  candidateId: {
    type: String,
    required: true,
    unique: true,
    ref: 'Candidate'
  },
  
  // Aadhar Card
  aadhar: {
    documentUrl: String,
    documentName: String,
    uploadedAt: Date,
    verified: {
      type: Boolean,
      default: false
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    verifiedAt: Date,
    rejectionReason: String
  },
  
  // PAN Card
  pan: {
    documentUrl: String,
    documentName: String,
    uploadedAt: Date,
    verified: {
      type: Boolean,
      default: false
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    verifiedAt: Date,
    rejectionReason: String
  },
  
  // Bank Details
  bankDetails: {
    bankName: String,
    accountNumber: String,
    ifscCode: String,
    accountHolderName: String,
    proofDocumentUrl: String,
    proofDocumentName: String,
    uploadedAt: Date,
    verified: {
      type: Boolean,
      default: false
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    verifiedAt: Date,
    rejectionReason: String
  },
  
  // Overall submission status
  allDocumentsSubmitted: {
    type: Boolean,
    default: false
  },
  
  allDocumentsVerified: {
    type: Boolean,
    default: false
  },
  
  submittedAt: Date,
  
  // Notification tracking
  submissionEmailSent: {
    type: Boolean,
    default: false
  },
  
  hrNotificationSent: {
    type: Boolean,
    default: false
  }
  
}, {
  timestamps: true
});

// Index for faster lookups
candidateDocumentSchema.index({ candidateId: 1 });

// Method to check if all documents are submitted
candidateDocumentSchema.methods.checkAllDocumentsSubmitted = function() {
  return !!(this.aadhar?.documentUrl && 
            this.pan?.documentUrl && 
            this.bankDetails?.accountNumber &&
            this.bankDetails?.proofDocumentUrl);
};

// Method to check if all documents are verified
candidateDocumentSchema.methods.checkAllDocumentsVerified = function() {
  return !!(this.aadhar?.verified && 
            this.pan?.verified && 
            this.bankDetails?.verified);
};

module.exports = mongoose.model('CandidateDocument', candidateDocumentSchema);
