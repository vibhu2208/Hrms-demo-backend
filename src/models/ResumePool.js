const mongoose = require('mongoose');

const resumePoolSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  
  // Resume Content
  rawText: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    trim: true
  },
  fileType: {
    type: String,
    enum: ['text', 'pdf', 'docx', 'json'],
    default: 'text'
  },
  
  // Parsed Information
  parsedData: {
    skills: [String],
    experience: {
      years: {
        type: Number,
        default: 0
      },
      months: {
        type: Number,
        default: 0
      }
    },
    education: [{
      degree: String,
      specialization: String,
      institution: String,
      year: String
    }],
    currentCompany: String,
    currentDesignation: String,
    location: String,
    previousRoles: [String],
    certifications: [String],
    languages: [String]
  },
  
  // CTC Information
  currentCTC: {
    type: Number,
    default: null
  },
  expectedCTC: {
    type: Number,
    default: null
  },
  
  // Location Information
  currentLocation: {
    type: String,
    trim: true
  },
  preferredLocation: [{
    type: String,
    trim: true
  }],
  
  // Processing Status
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  processingError: String,
  
  // AI Analysis Results
  aiAnalysis: {
    keyHighlights: [String],
    weaknesses: [String],
    overallFit: String,
    recommendations: [String],
    confidenceScore: Number
  },

  // Reducto AI Parsing Data (store complete response)
  reductoData: {
    type: mongoose.Schema.Types.Mixed, // Store complete Reducto JSON response
    response: mongoose.Schema.Types.Mixed, // Full API response
    extractedData: mongoose.Schema.Types.Mixed, // Processed extracted data
    confidence: mongoose.Schema.Types.Mixed, // Confidence scores
    metadata: mongoose.Schema.Types.Mixed // Parsing metadata
  },
  
  // Metadata
  source: {
    type: String,
    enum: ['upload', 'import', 'api', 'scraped'],
    default: 'upload'
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  tags: [String],
  notes: String,
  
  // Search and Matching
  searchableText: String, // Combined text for easy searching
  skillVector: [Number], // For semantic search
  
  // Status
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
  lastAnalyzed: Date
}, {
  timestamps: true
});

// Indexes for better search performance
resumePoolSchema.index({ name: 'text', searchableText: 'text' });
resumePoolSchema.index({ 'parsedData.skills': 1 });
resumePoolSchema.index({ 'parsedData.experience.years': 1 });
resumePoolSchema.index({ processingStatus: 1 });
resumePoolSchema.index({ status: 1 });
resumePoolSchema.index({ createdAt: -1 });
resumePoolSchema.index({ tags: 1 });
resumePoolSchema.index({ currentCTC: 1 });
resumePoolSchema.index({ expectedCTC: 1 });
resumePoolSchema.index({ currentLocation: 1 });
resumePoolSchema.index({ preferredLocation: 1 });

// Pre-save middleware to update searchableText
resumePoolSchema.pre('save', function(next) {
  if (this.isModified('rawText') || this.isModified('parsedData')) {
    this.searchableText = [
      this.rawText,
      this.name,
      this.email,
      (this.parsedData.skills || []).join(' '),
      (this.parsedData.currentDesignation || ''),
      (this.parsedData.currentCompany || ''),
      (this.parsedData.previousRoles || []).join(' ')
    ].join(' ').toLowerCase();
  }
  next();
});

// Static methods
resumePoolSchema.statics = {
  // Find by skills
  findBySkills: function(skills) {
    return this.find({
      'parsedData.skills': { $in: skills },
      status: 'active'
    });
  },
  
  // Find by experience range
  findByExperienceRange: function(minYears, maxYears) {
    return this.find({
      'parsedData.experience.years': { $gte: minYears, $lte: maxYears },
      status: 'active'
    });
  },
  
  // Search resumes
  searchResumes: function(query, filters = {}) {
    const searchQuery = {
      $text: { $search: query },
      status: 'active',
      ...filters
    };
    
    return this.find(searchQuery, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } });
  },
  
  // Get processing statistics
  getProcessingStats: function() {
    return this.aggregate([
      {
        $group: {
          _id: '$processingStatus',
          count: { $sum: 1 }
        }
      }
    ]);
  }
};

// Instance methods
resumePoolSchema.methods = {
  // Update parsed data
  updateParsedData: function(parsedData) {
    this.parsedData = { ...this.parsedData, ...parsedData };
    this.processingStatus = 'completed';
    return this.save();
  },
  
  // Mark as failed
  markAsFailed: function(error) {
    this.processingStatus = 'failed';
    this.processingError = error;
    return this.save();
  },
  
  // Update AI analysis
  updateAIAnalysis: function(analysis) {
    this.aiAnalysis = analysis;
    this.lastAnalyzed = new Date();
    return this.save();
  },
  
  // Get experience in years (decimal)
  getTotalExperience: function() {
    const years = this.parsedData.experience?.years || 0;
    const months = this.parsedData.experience?.months || 0;
    return years + (months / 12);
  },
  
  // Check if has specific skill
  hasSkill: function(skill) {
    const skills = this.parsedData.skills || [];
    return skills.some(s => 
      s.toLowerCase().includes(skill.toLowerCase()) || 
      skill.toLowerCase().includes(s.toLowerCase())
    );
  },
  
  // Get all skills as string
  getSkillsString: function() {
    return (this.parsedData.skills || []).join(', ');
  }
};

module.exports = resumePoolSchema;
