const mongoose = require('mongoose');

const complianceSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  },
  complianceType: {
    type: String,
    enum: [
      'background-verification', 'drug-test', 'medical-checkup',
      'safety-training', 'security-clearance', 'client-onboarding',
      'nda-signed', 'policy-acknowledgment', 'other'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed', 'failed', 'expired'],
    default: 'pending'
  },
  dueDate: Date,
  completedDate: Date,
  expiryDate: Date,
  documents: [{
    name: String,
    url: String,
    uploadedAt: Date
  }],
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  verifiedAt: Date,
  notes: String,
  alertEnabled: {
    type: Boolean,
    default: true
  },
  alertDaysBefore: {
    type: Number,
    default: 15
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for tracking
complianceSchema.index({ employee: 1, status: 1 });
complianceSchema.index({ expiryDate: 1, alertEnabled: 1 });

module.exports = mongoose.model('Compliance', complianceSchema);
