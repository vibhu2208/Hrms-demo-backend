const mongoose = require('mongoose');

const talentPoolSchema = new mongoose.Schema({
  talentCode: {
    type: String,
    unique: true
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Phone is required']
  },
  desiredDepartment: {
    type: String,
    required: true
  },
  desiredPosition: {
    type: String,
    required: true
  },
  experience: {
    years: Number,
    months: Number
  },
  currentCompany: String,
  currentDesignation: String,
  currentCTC: Number,
  expectedCTC: Number,
  noticePeriod: Number,
  skills: [String],
  education: [{
    degree: String,
    specialization: String,
    institution: String,
    passingYear: Number,
    percentage: Number
  }],
  resume: {
    url: String,
    filename: String,
    uploadedAt: Date
  },
  comments: String,
  currentLocation: String,
  preferredLocation: [String],
  status: {
    type: String,
    enum: ['new', 'reviewed', 'contacted', 'shortlisted', 'rejected', 'hired'],
    default: 'new'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  reviewedAt: Date,
  notes: String,
  // Ex-employee identification
  isExEmployee: {
    type: Boolean,
    default: false
  },
  exEmployeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  exEmployeeCode: String,
  // If later moved to a specific job
  movedToJob: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobPosting'
  },
  movedAt: Date,
  // Timeline/Activity Log
  timeline: [{
    action: {
      type: String,
      required: true
    },
    description: String,
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Generate talent code
talentPoolSchema.pre('save', async function(next) {
  if (!this.talentCode) {
    const count = await mongoose.model('TalentPool').countDocuments();
    this.talentCode = `TAL${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('TalentPool', talentPoolSchema);
