const mongoose = require('mongoose');

const jobDescriptionSchema = new mongoose.Schema({
  // Basic Job Information
  jobTitle: {
    type: String,
    required: true,
    trim: true
  },
  companyName: {
    type: String,
    trim: true
  },
  department: {
    type: String,
    trim: true
  },
  location: {
    type: String,
    trim: true
  },
  employmentType: {
    type: String,
    enum: ['full-time', 'part-time', 'contract', 'intern', 'freelance'],
    default: 'full-time'
  },

  // File Information
  originalFile: {
    url: String,
    filename: String,
    originalName: String,
    size: Number,
    mimetype: String,
    uploadedAt: Date,
    s3Key: String,
    s3Bucket: String,
    signedUrl: String
  },

  // Parsed Job Requirements
  parsedData: {
    // Experience Requirements
    experienceRequired: {
      minYears: {
        type: Number,
        default: 0
      },
      maxYears: {
        type: Number,
        default: null
      },
      preferredYears: Number
    },

    // Skills and Technologies
    requiredSkills: [{
      skill: String,
      level: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced', 'expert'],
        default: 'intermediate'
      },
      isMandatory: {
        type: Boolean,
        default: true
      }
    }],
    preferredSkills: [{
      skill: String,
      level: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced', 'expert'],
        default: 'intermediate'
      }
    }],
    // Legacy support for simple string arrays
    requiredSkillsSimple: [String],
    preferredSkillsSimple: [String],
    technologies: [String],

    // Education Requirements
    educationRequirements: [{
      degree: String,
      specialization: String,
      isMandatory: {
        type: Boolean,
        default: false
      }
    }],
    // Legacy support for simple string arrays
    educationRequirementsSimple: [String],

    // Salary Information
    salaryRange: {
      min: Number,
      max: Number,
      currency: {
        type: String,
        default: 'INR'
      }
    },

    // Location Requirements
    jobLocation: String,
    remoteWork: {
      type: String,
      enum: ['on-site', 'remote', 'hybrid', 'flexible'],
      default: 'on-site'
    },
    preferredLocations: [String],

    // Job Responsibilities
    responsibilities: [String],

    // Additional Requirements
    certifications: [String],
    languages: [{
      language: String,
      proficiency: {
        type: String,
        enum: ['basic', 'conversational', 'fluent', 'native'],
        default: 'conversational'
      }
    }],
    noticePeriod: {
      preferred: String,
      flexible: {
        type: Boolean,
        default: true
      }
    },

    // Benefits and Perks
    benefits: [String],
    perks: [String]
  },

  // JD Content and Processing
  rawText: {
    type: String
  },
  searchableText: {
    type: String
  },

  // Parsing Metadata
  parsingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  parsingError: String,
  parsingMetadata: {
    parserUsed: {
      type: String,
      enum: ['reducto', 'custom', 'manual'],
      default: 'custom'
    },
    parsedAt: Date,
    parsingTime: Number, // in milliseconds
    confidence: mongoose.Schema.Types.Mixed // confidence scores for different fields
  },

  // AI Analysis Results
  aiAnalysis: {
    keyRequirements: [String],
    jobSummary: String,
    difficultyLevel: {
      type: String,
      enum: ['entry', 'mid', 'senior', 'expert'],
      default: 'mid'
    },
    marketCompetitiveness: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    suggestedSkills: [String]
  },

  // Candidate Matching Data
  candidateMatches: [{
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Candidate'
    },
    matchScore: {
      type: Number,
      min: 0,
      max: 100
    },
    matchedSkills: [{
      skill: String,
      candidateLevel: String,
      requiredLevel: String,
      matchType: {
        type: String,
        enum: ['exact', 'partial', 'related'],
        default: 'exact'
      }
    }],
    experienceMatch: {
      candidateYears: Number,
      requiredMin: Number,
      requiredMax: Number,
      score: Number
    },
    locationMatch: {
      candidateLocation: String,
      jobLocation: String,
      distance: Number, // in km
      score: Number
    },
    educationMatch: {
      hasRequiredEducation: Boolean,
      candidateEducation: [String],
      requiredEducation: [String],
      score: Number
    },
    overallFit: {
      type: String,
      enum: ['excellent', 'good', 'average', 'poor'],
      default: 'average'
    },
    matchedAt: {
      type: Date,
      default: Date.now
    },
    isShortlisted: {
      type: Boolean,
      default: false
    }
  }],

  // Statistics
  statistics: {
    totalCandidatesMatched: {
      type: Number,
      default: 0
    },
    shortlistedCandidates: {
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
    averageMatches: {
      type: Number,
      default: 0
    },
    lastMatchedAt: Date
  },

  // Associated Job Posting
  jobPostingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobPosting'
  },

  // Metadata
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  tags: [String],
  notes: String,
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived'],
    default: 'active'
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastProcessedAt: Date
}, {
  timestamps: true
});

// Indexes for better search performance
jobDescriptionSchema.index({ jobTitle: 'text', 'parsedData.requiredSkills.skill': 'text', searchableText: 'text' });
jobDescriptionSchema.index({ 'parsedData.requiredSkills.skill': 1 });
jobDescriptionSchema.index({ 'parsedData.experienceRequired.minYears': 1 });
jobDescriptionSchema.index({ 'parsedData.experienceRequired.maxYears': 1 });
jobDescriptionSchema.index({ 'parsedData.jobLocation': 1 });
jobDescriptionSchema.index({ parsingStatus: 1 });
jobDescriptionSchema.index({ status: 1 });
jobDescriptionSchema.index({ uploadedBy: 1 });
jobDescriptionSchema.index({ jobPostingId: 1 });
jobDescriptionSchema.index({ 'candidateMatches.candidateId': 1 });
jobDescriptionSchema.index({ 'candidateMatches.matchScore': -1 });
jobDescriptionSchema.index({ createdAt: -1 });

// Pre-save middleware to update searchableText
jobDescriptionSchema.pre('save', function(next) {
  if (this.isModified('rawText') || this.isModified('parsedData') || this.isModified('jobTitle')) {
    const skills = (this.parsedData?.requiredSkills || []).map(s => s.skill).join(' ');
    const preferredSkills = (this.parsedData?.preferredSkills || []).map(s => s.skill).join(' ');
    const technologies = (this.parsedData?.technologies || []).join(' ');
    const responsibilities = (this.parsedData?.responsibilities || []).join(' ');

    this.searchableText = [
      this.jobTitle || '',
      this.companyName || '',
      this.department || '',
      this.location || '',
      this.rawText || '',
      skills,
      preferredSkills,
      technologies,
      responsibilities
    ].join(' ').toLowerCase();
  }
  next();
});

// Instance methods
jobDescriptionSchema.methods = {
  // Update parsed data
  updateParsedData: function(parsedData) {
    this.parsedData = { ...this.parsedData, ...parsedData };
    this.parsingStatus = 'completed';
    this.lastProcessedAt = new Date();
    return this.save();
  },

  // Mark parsing as failed
  markParsingFailed: function(error) {
    this.parsingStatus = 'failed';
    this.parsingError = error;
    return this.save();
  },

  // Add candidate match
  addCandidateMatch: function(matchData) {
    // Remove existing match for this candidate if exists
    this.candidateMatches = this.candidateMatches.filter(
      match => match.candidateId.toString() !== matchData.candidateId.toString()
    );

    // Add new match
    this.candidateMatches.push({
      candidateId: matchData.candidateId,
      matchScore: matchData.matchScore,
      matchedSkills: matchData.matchedSkills,
      experienceMatch: matchData.experienceMatch,
      locationMatch: matchData.locationMatch,
      educationMatch: matchData.educationMatch,
      overallFit: matchData.overallFit,
      matchedAt: new Date()
    });

    // Update statistics
    this.updateMatchStatistics();
    return this.save();
  },

  // Update match statistics
  updateMatchStatistics: function() {
    this.statistics.totalCandidatesMatched = this.candidateMatches.length;
    this.statistics.shortlistedCandidates = this.candidateMatches.filter(m => m.isShortlisted).length;
    this.statistics.excellentMatches = this.candidateMatches.filter(m => m.overallFit === 'excellent').length;
    this.statistics.goodMatches = this.candidateMatches.filter(m => m.overallFit === 'good').length;
    this.statistics.averageMatches = this.candidateMatches.filter(m => m.overallFit === 'average').length;
    this.statistics.lastMatchedAt = new Date();
  },

  // Get top matches
  getTopMatches: function(limit = 10) {
    return this.candidateMatches
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);
  },

  // Get matches by fit level
  getMatchesByFit: function(fitLevel) {
    return this.candidateMatches.filter(match => match.overallFit === fitLevel);
  },

  // Check if candidate is already matched
  isCandidateMatched: function(candidateId) {
    return this.candidateMatches.some(
      match => match.candidateId.toString() === candidateId.toString()
    );
  }
};

// Static methods
jobDescriptionSchema.statics = {
  // Find JDs by skills
  findByRequiredSkills: function(skills) {
    return this.find({
      'parsedData.requiredSkills.skill': { $in: skills },
      status: 'active',
      parsingStatus: 'completed'
    });
  },

  // Find JDs by experience range
  findByExperienceRange: function(minYears, maxYears) {
    return this.find({
      $or: [
        { 'parsedData.experienceRequired.minYears': { $lte: maxYears } },
        { 'parsedData.experienceRequired.maxYears': { $gte: minYears } }
      ],
      status: 'active',
      parsingStatus: 'completed'
    });
  },

  // Find JDs by location
  findByLocation: function(location) {
    return this.find({
      $or: [
        { 'parsedData.jobLocation': new RegExp(location, 'i') },
        { 'parsedData.preferredLocations': new RegExp(location, 'i') }
      ],
      status: 'active',
      parsingStatus: 'completed'
    });
  },

  // Search JDs
  searchJobDescriptions: function(query, filters = {}) {
    const searchQuery = {
      $text: { $search: query },
      status: 'active',
      parsingStatus: 'completed',
      ...filters
    };

    return this.find(searchQuery, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } });
  },

  // Get parsing statistics
  getParsingStats: function() {
    return this.aggregate([
      {
        $group: {
          _id: '$parsingStatus',
          count: { $sum: 1 }
        }
      }
    ]);
  }
};

module.exports = mongoose.model('JobDescription', jobDescriptionSchema);