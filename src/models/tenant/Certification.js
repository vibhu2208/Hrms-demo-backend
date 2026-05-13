/**
 * Certification Model - Stored in tenant database
 * Tracks professional certifications for employees
 */

const mongoose = require('mongoose');

const certificationSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Employee ID is required'],
    index: true
  },
  employeeEmail: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  certificationName: {
    type: String,
    required: [true, 'Certification name is required'],
    trim: true
  },
  issuingOrganization: {
    type: String,
    required: [true, 'Issuing organization is required'],
    trim: true
  },
  certificateNumber: {
    type: String,
    trim: true
  },
  issueDate: {
    type: Date,
    required: [true, 'Issue date is required']
  },
  expiryDate: {
    type: Date,
    index: true
  },
  isExpired: {
    type: Boolean,
    default: false,
    index: true
  },
  isPermanent: {
    type: Boolean,
    default: false
  },
  documentUrl: {
    type: String
  },
  skills: [{
    type: String,
    trim: true
  }],
  description: {
    type: String,
    trim: true
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verifiedAt: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
certificationSchema.index({ employeeId: 1, isActive: 1 });
certificationSchema.index({ expiryDate: 1, isExpired: 1 });
certificationSchema.index({ verificationStatus: 1 });

// Check expiry before saving
certificationSchema.pre('save', function(next) {
  if (this.expiryDate && !this.isPermanent) {
    const now = new Date();
    this.isExpired = this.expiryDate < now;
  }
  next();
});

module.exports = certificationSchema;


