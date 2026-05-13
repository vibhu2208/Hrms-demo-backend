const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  documentType: {
    type: String,
    enum: [
      'aadhaar', 'pan', 'passport', 'driving-license',
      'offer-letter', 'appointment-letter', 'contract',
      'id-proof', 'address-proof', 'education',
      'experience-letter', 'relieving-letter',
      'medical-certificate', 'insurance', 'visa',
      'work-permit', 'background-verification', 'other'
    ],
    required: true
  },
  documentName: {
    type: String,
    required: true
  },
  documentNumber: String,
  issueDate: Date,
  expiryDate: Date,
  issuingAuthority: String,
  fileUrl: {
    type: String,
    required: true
  },
  fileSize: Number,
  mimeType: String,
  status: {
    type: String,
    enum: ['pending', 'verified', 'rejected', 'expired'],
    default: 'pending'
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  verifiedAt: Date,
  rejectionReason: String,
  notes: String,
  isCompliance: {
    type: Boolean,
    default: false
  },
  alertDaysBefore: {
    type: Number,
    default: 30
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for expiry tracking
documentSchema.index({ expiryDate: 1, status: 1 });

module.exports = mongoose.model('Document', documentSchema);
