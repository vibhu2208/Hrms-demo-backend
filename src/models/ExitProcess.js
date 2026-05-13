const mongoose = require('mongoose');

const exitProcessSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  exitType: {
    type: String,
    enum: ['resignation', 'termination', 'retirement', 'contract-end', 'mutual-separation'],
    required: true
  },
  resignationDate: Date,
  lastWorkingDate: {
    type: Date,
    required: true
  },
  noticePeriod: {
    required: Number,
    served: Number
  },
  reason: String,
  clearanceChecklist: {
    hr: {
      cleared: { type: Boolean, default: false },
      clearedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
      clearedAt: Date,
      notes: String,
      documents: [{ name: String, url: String }]
    },
    finance: {
      cleared: { type: Boolean, default: false },
      clearedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
      clearedAt: Date,
      notes: String,
      pendingAmount: Number
    },
    it: {
      cleared: { type: Boolean, default: false },
      clearedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
      clearedAt: Date,
      notes: String,
      assetsReturned: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }]
    },
    admin: {
      cleared: { type: Boolean, default: false },
      clearedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
      clearedAt: Date,
      notes: String
    },
    projectManager: {
      cleared: { type: Boolean, default: false },
      clearedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
      clearedAt: Date,
      notes: String,
      knowledgeTransfer: Boolean
    }
  },
  exitInterview: {
    scheduled: Boolean,
    scheduledDate: Date,
    conductedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    conductedAt: Date,
    feedback: String,
    rehireEligible: Boolean
  },
  finalSettlement: {
    amount: Number,
    paymentDate: Date,
    paymentStatus: {
      type: String,
      enum: ['pending', 'processed', 'completed'],
      default: 'pending'
    },
    transactionId: String
  },
  documents: [{
    type: {
      type: String,
      enum: ['resignation-letter', 'acceptance-letter', 'clearance-form', 
             'experience-letter', 'relieving-letter', 'fnf-statement', 'other']
    },
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  status: {
    type: String,
    enum: ['initiated', 'clearance-pending', 'clearance-completed', 'completed', 'cancelled'],
    default: 'initiated'
  },
  completedAt: Date,
  notes: String,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ExitProcess', exitProcessSchema);
