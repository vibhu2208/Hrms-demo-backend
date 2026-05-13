/**
 * Family Detail Model - Stored in tenant database
 * Tracks dependents and nominees for employees
 */

const mongoose = require('mongoose');

const familyDetailSchema = new mongoose.Schema({
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
  relationship: {
    type: String,
    required: [true, 'Relationship is required'],
    enum: ['spouse', 'son', 'daughter', 'father', 'mother', 'brother', 'sister', 'father_in_law', 'mother_in_law', 'other'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  dateOfBirth: {
    type: Date,
    required: [true, 'Date of birth is required']
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other']
  },
  aadhaarNumber: {
    type: String,
    trim: true
  },
  panNumber: {
    type: String,
    trim: true
  },
  isNominee: {
    type: Boolean,
    default: false,
    index: true
  },
  nomineeFor: [{
    type: String,
    enum: ['PF', 'ESI', 'Gratuity', 'Insurance', 'Pension', 'Other']
  }],
  nomineePercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 100
  },
  contactNumber: {
    type: String,
    trim: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  documents: [{
    documentType: {
      type: String,
      enum: ['birth_certificate', 'aadhaar', 'pan', 'passport', 'relationship_proof', 'nomination_form', 'other']
    },
    documentName: String,
    documentUrl: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
familyDetailSchema.index({ employeeId: 1, isActive: 1 });
familyDetailSchema.index({ employeeId: 1, isNominee: 1 });

module.exports = familyDetailSchema;


