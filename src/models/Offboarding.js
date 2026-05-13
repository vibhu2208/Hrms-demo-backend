const mongoose = require('mongoose');

const offboardingSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  lastWorkingDate: {
    type: Date,
    required: true
  },
  resignationType: {
    type: String,
    enum: ['voluntary', 'involuntary', 'retirement', 'contract-end'],
    required: true
  },
  reason: {
    type: String
  },
  stages: [{
    type: String,
    enum: ['exitDiscussion', 'assetReturn', 'documentation', 'finalSettlement', 'success']
  }],
  currentStage: {
    type: String,
    enum: ['exitDiscussion', 'assetReturn', 'documentation', 'finalSettlement', 'success'],
    default: 'exitDiscussion'
  },
  status: {
    type: String,
    enum: ['in-progress', 'completed', 'cancelled'],
    default: 'in-progress'
  },
  exitInterview: {
    scheduledDate: Date,
    conductedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    feedback: String,
    completed: {
      type: Boolean,
      default: false
    }
  },
  assetsReturned: [{
    asset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset'
    },
    returnedDate: Date,
    condition: String
  }],
  clearance: {
    hr: {
      cleared: { type: Boolean, default: false },
      clearedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
      clearedAt: Date,
      notes: String
    },
    finance: {
      cleared: { type: Boolean, default: false },
      clearedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
      clearedAt: Date,
      notes: String
    },
    it: {
      cleared: { type: Boolean, default: false },
      clearedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
      clearedAt: Date,
      notes: String
    },
    admin: {
      cleared: { type: Boolean, default: false },
      clearedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
      clearedAt: Date,
      notes: String
    }
  },
  finalSettlement: {
    amount: Number,
    paymentDate: Date,
    paymentStatus: {
      type: String,
      enum: ['pending', 'processed', 'completed'],
      default: 'pending'
    }
  },
  documents: [{
    type: {
      type: String,
      enum: ['resignation-letter', 'clearance-form', 'experience-letter', 'relieving-letter', 'other']
    },
    name: String,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  notes: {
    type: String
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Offboarding', offboardingSchema);
