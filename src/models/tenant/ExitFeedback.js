const mongoose = require('mongoose');

/**
 * Exit Feedback Model - Exit interview and feedback collection
 * Phase 1: Module Setup & Data Model
 */
const exitFeedbackSchema = new mongoose.Schema({
  // Reference Information
  offboardingRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OffboardingRequest',
    required: true,
    index: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true
  },

  // Interview Details
  interviewDetails: {
    scheduledDate: Date,
    actualDate: Date,
    duration: Number, // in minutes
    interviewType: {
      type: String,
      enum: ['face_to_face', 'video_call', 'phone_call', 'written_form'],
      default: 'face_to_face'
    },
    conductedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    location: String,
    meetingLink: String,
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled', 'rescheduled'],
      default: 'scheduled'
    }
  },

  // Reason for Leaving
  leavingReason: {
    primaryReason: {
      type: String,
      enum: [
        'better_opportunity', 'higher_salary', 'career_growth', 'work_life_balance',
        'company_culture', 'management_issues', 'job_dissatisfaction', 'relocation',
        'personal_reasons', 'health_issues', 'family_reasons', 'retirement',
        'contract_end', 'layoff', 'termination', 'other'
      ],
      required: true
    },
    secondaryReasons: [{
      type: String,
      enum: [
        'better_opportunity', 'higher_salary', 'career_growth', 'work_life_balance',
        'company_culture', 'management_issues', 'job_dissatisfaction', 'relocation',
        'personal_reasons', 'health_issues', 'family_reasons', 'retirement',
        'contract_end', 'layoff', 'termination', 'other'
      ]
    }],
    detailedExplanation: String,
    couldHaveBeenPrevented: {
      type: String,
      enum: ['yes', 'no', 'maybe']
    },
    preventionSuggestions: String
  },

  // Job Satisfaction Ratings
  jobSatisfaction: {
    overallSatisfaction: {
      type: Number,
      min: 1,
      max: 5
    },
    workContent: {
      type: Number,
      min: 1,
      max: 5
    },
    workEnvironment: {
      type: Number,
      min: 1,
      max: 5
    },
    managementSupport: {
      type: Number,
      min: 1,
      max: 5
    },
    teamCollaboration: {
      type: Number,
      min: 1,
      max: 5
    },
    compensationBenefits: {
      type: Number,
      min: 1,
      max: 5
    },
    careerDevelopment: {
      type: Number,
      min: 1,
      max: 5
    },
    workLifeBalance: {
      type: Number,
      min: 1,
      max: 5
    },
    companyValues: {
      type: Number,
      min: 1,
      max: 5
    },
    jobSecurity: {
      type: Number,
      min: 1,
      max: 5
    }
  },

  // Detailed Feedback
  detailedFeedback: {
    // What did you like most about working here?
    positiveAspects: String,
    
    // What did you like least about working here?
    negativeAspects: String,
    
    // How would you describe the company culture?
    companyCulture: String,
    
    // How was your relationship with your immediate supervisor?
    supervisorRelationship: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      feedback: String
    },
    
    // How was your relationship with colleagues?
    colleagueRelationship: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      feedback: String
    },
    
    // Training and development opportunities
    trainingDevelopment: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      feedback: String,
      suggestions: String
    },
    
    // Communication within the organization
    communication: {
      rating: {
        type: Number,
        min: 1,
      max: 5
      },
      feedback: String,
      suggestions: String
    },
    
    // Workload and job expectations
    workload: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      feedback: String,
      wasRealistic: Boolean
    }
  },

  // Improvement Suggestions
  suggestions: {
    // What changes would you suggest to improve the workplace?
    workplaceImprovements: String,
    
    // What would have made you stay?
    retentionFactors: String,
    
    // Suggestions for your replacement
    replacementAdvice: String,
    
    // Process improvements
    processImprovements: String,
    
    // Management improvements
    managementImprovements: String,
    
    // Policy improvements
    policyImprovements: String
  },

  // Future Engagement
  futureEngagement: {
    // Would you recommend this company to others?
    wouldRecommend: {
      type: String,
      enum: ['yes', 'no', 'maybe']
    },
    recommendationReason: String,
    
    // Would you consider returning in the future?
    wouldReturn: {
      type: String,
      enum: ['yes', 'no', 'maybe']
    },
    returnConditions: String,
    
    // Would you like to stay connected (alumni network)?
    stayConnected: Boolean,
    
    // Can we contact you for future surveys?
    futureContact: Boolean
  },

  // New Role Information
  newRole: {
    hasNewJob: Boolean,
    companyName: String,
    position: String,
    industry: String,
    salaryIncrease: {
      type: String,
      enum: ['0-10%', '10-20%', '20-30%', '30-50%', 'more_than_50%', 'decrease', 'same']
    },
    startDate: Date,
    howFoundJob: {
      type: String,
      enum: ['job_portal', 'referral', 'headhunter', 'company_website', 'networking', 'other']
    }
  },

  // Additional Comments
  additionalComments: String,
  confidentialComments: String, // Only visible to HR

  // Interview Summary (filled by interviewer)
  interviewSummary: {
    keyPoints: [String],
    actionItems: [String],
    followUpRequired: Boolean,
    followUpDate: Date,
    interviewerNotes: String,
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low'
    },
    escalationRequired: Boolean,
    escalationReason: String
  },

  // Completion Status
  completionStatus: {
    type: String,
    enum: ['not_started', 'in_progress', 'completed', 'declined'],
    default: 'not_started'
  },
  completedAt: Date,
  
  // Employee Consent
  consent: {
    dataUsage: Boolean,
    sharing: Boolean,
    followUp: Boolean,
    consentDate: Date
  },

  // Analytics Tags
  tags: [String],
  
  // Sentiment Analysis (if implemented)
  sentimentAnalysis: {
    overallSentiment: {
      type: String,
      enum: ['positive', 'neutral', 'negative']
    },
    confidenceScore: Number,
    keyPhrases: [String]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
exitFeedbackSchema.index({ offboardingRequestId: 1 });
exitFeedbackSchema.index({ employeeId: 1, clientId: 1 });
exitFeedbackSchema.index({ completionStatus: 1 });
exitFeedbackSchema.index({ 'leavingReason.primaryReason': 1 });
exitFeedbackSchema.index({ 'interviewDetails.conductedBy': 1 });
exitFeedbackSchema.index({ createdAt: 1 });

// Virtual for overall satisfaction average
exitFeedbackSchema.virtual('averageSatisfaction').get(function() {
  const satisfaction = this.jobSatisfaction;
  if (!satisfaction) return 0;
  
  const ratings = [
    satisfaction.overallSatisfaction,
    satisfaction.workContent,
    satisfaction.workEnvironment,
    satisfaction.managementSupport,
    satisfaction.teamCollaboration,
    satisfaction.compensationBenefits,
    satisfaction.careerDevelopment,
    satisfaction.workLifeBalance,
    satisfaction.companyValues,
    satisfaction.jobSecurity
  ].filter(rating => rating && rating > 0);
  
  if (ratings.length === 0) return 0;
  return Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10;
});

// Virtual for completion percentage
exitFeedbackSchema.virtual('completionPercentage').get(function() {
  let completed = 0;
  let total = 0;
  
  // Check required sections
  if (this.leavingReason?.primaryReason) completed++;
  total++;
  
  if (this.jobSatisfaction?.overallSatisfaction) completed++;
  total++;
  
  if (this.detailedFeedback?.positiveAspects) completed++;
  total++;
  
  if (this.suggestions?.workplaceImprovements) completed++;
  total++;
  
  if (this.futureEngagement?.wouldRecommend) completed++;
  total++;
  
  return Math.round((completed / total) * 100);
});

// Pre-save middleware
exitFeedbackSchema.pre('save', function(next) {
  // Set completion status based on completion percentage
  if (this.completionPercentage === 100 && this.completionStatus !== 'completed') {
    this.completionStatus = 'completed';
    this.completedAt = new Date();
  } else if (this.completionPercentage > 0 && this.completionStatus === 'not_started') {
    this.completionStatus = 'in_progress';
  }
  
  next();
});

// Static methods
exitFeedbackSchema.statics.getByEmployee = function(employeeId, clientId) {
  return this.findOne({ employeeId, clientId })
    .populate('employeeId', 'firstName lastName email employeeCode')
    .populate('interviewDetails.conductedBy', 'email firstName lastName');
};

exitFeedbackSchema.statics.getCompletedFeedbacks = function(clientId, fromDate, toDate) {
  const query = {
    clientId,
    completionStatus: 'completed'
  };
  
  if (fromDate || toDate) {
    query.completedAt = {};
    if (fromDate) query.completedAt.$gte = new Date(fromDate);
    if (toDate) query.completedAt.$lte = new Date(toDate);
  }
  
  return this.find(query)
    .populate('employeeId', 'firstName lastName email employeeCode department')
    .sort({ completedAt: -1 });
};

exitFeedbackSchema.statics.getAnalytics = function(clientId, fromDate, toDate) {
  const matchStage = {
    clientId: new mongoose.Types.ObjectId(clientId),
    completionStatus: 'completed'
  };
  
  if (fromDate || toDate) {
    matchStage.completedAt = {};
    if (fromDate) matchStage.completedAt.$gte = new Date(fromDate);
    if (toDate) matchStage.completedAt.$lte = new Date(toDate);
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$leavingReason.primaryReason',
        count: { $sum: 1 },
        avgSatisfaction: { $avg: '$jobSatisfaction.overallSatisfaction' },
        wouldRecommendYes: {
          $sum: { $cond: [{ $eq: ['$futureEngagement.wouldRecommend', 'yes'] }, 1, 0] }
        },
        wouldReturnYes: {
          $sum: { $cond: [{ $eq: ['$futureEngagement.wouldReturn', 'yes'] }, 1, 0] }
        }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

module.exports = exitFeedbackSchema;
