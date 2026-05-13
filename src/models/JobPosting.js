const mongoose = require('mongoose');

const jobPostingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Job title is required']
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  location: {
    type: String,
    required: true
  },
  employmentType: {
    type: String,
    enum: ['full-time', 'part-time', 'consultant', 'intern', 'contract-based', 'deliverable-based', 'rate-based', 'hourly-based'],
    default: 'full-time'
  },
  experience: {
    min: Number,
    max: Number
  },
  salary: {
    min: Number,
    max: Number,
    currency: {
      type: String,
      default: 'USD'
    }
  },
  description: {
    type: String,
    required: true
  },
  requirements: [{
    type: String
  }],
  responsibilities: [{
    type: String
  }],
  skills: [{
    type: String
  }],
  openings: {
    type: Number,
    default: 1
  },
  // Employment type specific fields
  contractDuration: String,
  hourlyRate: Number,
  deliverables: [String],
  rateAmount: Number,
  ratePeriod: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'quarterly', 'per-project'],
    default: 'monthly'
  },
  workHours: String,
  status: {
    type: String,
    enum: ['draft', 'active', 'closed', 'on-hold', 'archived'],
    default: 'draft'
  },
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  postedDate: {
    type: Date
  },
  closingDate: {
    type: Date
  },
  applications: {
    type: Number,
    default: 0
  },

  // Job Description Integration
  jobDescription: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobDescription'
  },

  // JD Parsing Status
  jdParsingStatus: {
    type: String,
    enum: ['not-uploaded', 'pending', 'processing', 'completed', 'failed'],
    default: 'not-uploaded'
  },
  jdParsingError: String,

  // Auto-matching settings
  autoMatching: {
    enabled: {
      type: Boolean,
      default: false
    },
    minScore: {
      type: Number,
      default: 60,
      min: 0,
      max: 100
    },
    autoShortlist: {
      type: Boolean,
      default: false
    },
    autoShortlistThreshold: {
      type: Number,
      default: 80,
      min: 0,
      max: 100
    },
    lastAutoMatchRun: Date
  },

  // Matching Statistics
  matchingStats: {
    totalCandidatesMatched: {
      type: Number,
      default: 0
    },
    excellentMatches: {
      type: Number,
      default: 0
    },
    goodMatches: {
      type: Number,
      default: 0
    },
    autoShortlisted: {
      type: Number,
      default: 0
    },
    lastMatchedAt: Date
  }
}, {
  timestamps: true
});

// Instance methods
jobPostingSchema.methods = {
  // Link job description
  linkJobDescription: function(jobDescriptionId) {
    this.jobDescription = jobDescriptionId;
    this.jdParsingStatus = 'completed';
    return this.save();
  },

  // Update matching statistics
  updateMatchingStats: function(stats) {
    this.matchingStats = {
      ...this.matchingStats,
      ...stats,
      lastMatchedAt: new Date()
    };
    return this.save();
  },

  // Check if auto-matching should run
  shouldRunAutoMatching: function() {
    if (!this.autoMatching.enabled) return false;
    if (!this.jobDescription) return false;
    if (this.status !== 'active') return false;

    // Run auto-matching if never run before or if it's been more than 24 hours
    const lastRun = this.autoMatching.lastAutoMatchRun;
    if (!lastRun) return true;

    const hoursSinceLastRun = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60);
    return hoursSinceLastRun >= 24;
  },

  // Get matching candidates
  getMatchingCandidates: async function(limit = 20) {
    if (!this.jobDescription) return [];

    const JobDescription = mongoose.model('JobDescription');
    const jd = await JobDescription.findById(this.jobDescription)
      .populate('candidateMatches.candidateId');

    if (!jd || !jd.candidateMatches) return [];

    return jd.candidateMatches
      .filter(match => match.matchScore >= this.autoMatching.minScore)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);
  }
};

// Static methods
jobPostingSchema.statics = {
  // Find active job postings with JD
  findActiveWithJD: function() {
    return this.find({
      status: 'active',
      jdParsingStatus: 'completed',
      jobDescription: { $exists: true, $ne: null }
    }).populate('jobDescription');
  },

  // Find job postings that need auto-matching
  findJobsNeedingAutoMatching: function() {
    return this.find({
      status: 'active',
      'autoMatching.enabled': true,
      jdParsingStatus: 'completed',
      jobDescription: { $exists: true, $ne: null },
      $or: [
        { 'autoMatching.lastAutoMatchRun': { $exists: false } },
        { 'autoMatching.lastAutoMatchRun': { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
      ]
    });
  }
};

// Export both the schema and the model for flexibility
const JobPostingModel = mongoose.model('JobPosting', jobPostingSchema);
module.exports = JobPostingModel;
module.exports.jobPostingSchema = jobPostingSchema;
