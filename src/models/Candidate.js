const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
  candidateCode: {
    type: String,
    unique: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: true
  },
  alternatePhone: String,
  // Additional personal information
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other']
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  },
  maritalStatus: {
    type: String,
    enum: ['single', 'married', 'divorced', 'widowed']
  },
  // Address information
  address: {
    street: { type: String },
    city: { type: String },
    state: { type: String },
    zipCode: { type: String },
    country: { type: String }
  },
  // Emergency contact
  emergencyContact: {
    name: { type: String },
    relationship: { type: String },
    phone: { type: String }
  },
  currentLocation: String,
  preferredLocation: [String],
  source: {
    type: String,
    enum: ['internal', 'linkedin', 'naukri', 'referral', 'job-portal', 'walk-in', 'other'],
    default: 'other'
  },
  employmentType: {
    type: String,
    enum: ['full-time', 'part-time', 'consultant', 'intern', 'contract-based', 'deliverable-based', 'rate-based', 'hourly-based'],
    default: 'full-time'
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  appliedFor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobPosting',
    required: false
  },
  appliedForTitle: {
    type: String,
    trim: true
  },
  experience: {
    years: Number,
    months: Number
  },
  // Professional Experience Details
  professionalExperience: [{
    company: String,
    designation: String,
    startDate: Date,
    endDate: Date,
    currentlyWorking: {
      type: Boolean,
      default: false
    },
    responsibilities: String,
    achievements: String,
    technologies: [String],
    ctc: Number,
    reasonForLeaving: String
  }],
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
  trainingCertificates: [{
    type: {
      type: String,
      enum: ['training', 'certificate'],
      default: 'training'
    },
    name: {
      type: String,
      required: true
    },
    issuingOrganization: {
      type: String,
      required: true
    },
    completionDate: {
      type: Date,
      required: true
    },
    expiryDate: Date,
    credentialId: String,
    credentialUrl: String,
    description: String
  }],
  resume: {
    url: String,
    filename: String,
    originalName: String,
    size: Number,
    mimetype: String,
    uploadedAt: Date,
    s3Key: String,      // S3 object key
    s3Bucket: String,   // S3 bucket name
    signedUrl: String   // Temporary signed URL for access
  },
  stage: {
    type: String,
    enum: ['applied', 'screening', 'shortlisted', 'interview-scheduled', 
           'interview-completed', 'offer-extended', 'offer-accepted', 
           'offer-rejected', 'sent-to-onboarding', 'joined', 'rejected'],
    default: 'applied'
  },
  interviews: [{
    interviewType: {
      type: String,
      enum: ['Technical', 'HR', 'Managerial', 'Cultural Fit', 'Final Round', 'Other'],
      default: 'Technical'
    },
    round: String,
    scheduledDate: Date,
    scheduledTime: String,
    meetingLink: String,
    meetingPlatform: {
      type: String,
      enum: ['Google Meet', 'Microsoft Teams', 'Zoom', 'Phone', 'In-Person', 'Other'],
      default: 'Google Meet'
    },
    interviewer: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],
    feedback: String,
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    decision: {
      type: String,
      enum: ['selected', 'rejected', 'on-hold', 'pending'],
      default: 'pending'
    },
    notes: String,
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled', 'no-show', 'rescheduled'],
      default: 'scheduled'
    },
    completedAt: Date,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Notification tracking
  notifications: {
    interviewEmail: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }
    },
    interviewCall: {
      completed: { type: Boolean, default: false },
      completedAt: Date,
      completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
      notes: String
    },
    offerEmail: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }
    },
    rejectionEmail: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }
    }
  },
  // HR Call tracking
  hrCall: {
    status: {
      type: String,
      enum: ['pending', 'completed', 'scheduled'],
      default: 'pending'
    },
    scheduledDate: Date,
    completedDate: Date,
    summary: String,
    decision: {
      type: String,
      enum: ['move-to-onboarding', 'reject', 'on-hold', 'pending'],
      default: 'pending'
    },
    conductedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }
  },
  // Timeline/Activity Log
  timeline: [{
    action: {
      type: String,
      required: true
    },
    description: String,
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    metadata: mongoose.Schema.Types.Mixed,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  offerDetails: {
    offeredCTC: Number,
    offeredDesignation: String,
    joiningDate: Date,
    offerLetterUrl: String,
    offerExtendedDate: Date,
    offerAcceptedDate: Date
  },
  
  // Onboarding Connection
  onboardingRecord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Onboarding'
  },
  
  sentToOnboardingAt: Date,
  
  sentToOnboardingBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  rejectionReason: String,
  notes: String,
  status: {
    type: String,
    enum: ['active', 'hired', 'rejected', 'withdrawn'],
    default: 'active'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Duplicate Detection Fields
  isDuplicate: {
    type: Boolean,
    default: false
  },
  duplicateOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Candidate'
  },
  // Flexible Workflow Fields
  canSkipStages: {
    type: Boolean,
    default: true
  },
  workflowHistory: [{
    fromStage: String,
    toStage: String,
    skippedStages: [String],
    movedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    reason: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  // Cross-Application History Fields
  masterCandidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Candidate'
  },
  // Link to employee if candidate becomes employee
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  isEmployee: {
    type: Boolean,
    default: false
  },
  isExEmployee: {
    type: Boolean,
    default: false
  },
  exEmployeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  exEmployeeCode: String,
  applicationHistory: [{
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobPosting'
    },
    jobTitle: String,
    appliedDate: {
      type: Date,
      default: Date.now
    },
    stage: String,
    status: String,
    outcome: {
      type: String,
      enum: ['hired', 'rejected', 'withdrawn', 'ongoing', null],
      default: null
    },
    interviews: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Interview'
    }],
    onboardingRecord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Onboarding'
    },
    offboardingRecord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Offboarding'
    }
  }],
  // AI Analysis Fields
  aiAnalysis: {
    matchScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },
    analysisDate: Date,
    skillsMatch: {
      matched: [String],
      missing: [String],
      additional: [String],
      matchPercentage: Number
    },
    experienceMatch: {
      isMatch: Boolean,
      candidateYears: Number,
      requiredYears: String,
      score: Number
    },
    keyHighlights: [String],
    weaknesses: [String],
    overallFit: {
      type: String,
      enum: ['excellent', 'good', 'average', 'poor', null],
      default: null
    },
    resumeInsights: {
      totalExperience: String,
      keySkills: [String],
      education: [String],
      certifications: [String],
      projects: [String]
    },
    semanticScore: Number, // Embedding similarity score
    isAnalyzed: {
      type: Boolean,
      default: false
    }
  },
  // Resume Parsing Fields (Reducto Integration)
  resumeParsing: {
    rawText: String, // Full extracted text from resume
    confidence: {
      type: Map,
      of: Number
    }, // Confidence scores per field
    parsedAt: Date, // When parsing was done
    parserVersion: String, // Version of parser used
    parsingSource: {
      type: String,
      enum: ['reducto', 'manual', 'other'],
      default: 'manual'
    },
    parsingMetadata: {
      fileName: String,
      fileSize: Number,
      mimeType: String,
      uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    },
    // Store complete Reducto JSON response for auditing/debugging
    reductoResponse: {
      type: mongoose.Schema.Types.Mixed // Store full JSON from Reducto
    },
    // Store the extracted data object from Reducto
    extractedData: {
      type: mongoose.Schema.Types.Mixed // Store the extractedData object
    }
  }
}, {
  timestamps: true
});

// Indexes for duplicate detection
candidateSchema.index({ email: 1 });
candidateSchema.index({ phone: 1 });
candidateSchema.index({ email: 1, phone: 1 });
candidateSchema.index({ isDuplicate: 1 });
candidateSchema.index({ duplicateOf: 1 });

// Helper function to normalize phone number
const normalizePhone = (phone) => {
  if (!phone) return null;
  // Remove all non-digit characters
  return phone.replace(/\D/g, '');
};

// Pre-save hook to check for duplicates (non-blocking, just flag)
candidateSchema.pre('save', async function(next) {
  // Convert empty strings to undefined for enum fields to avoid validation errors
  if (this.gender === '') this.gender = undefined;
  if (this.bloodGroup === '') this.bloodGroup = undefined;
  if (this.maritalStatus === '') this.maritalStatus = undefined;
  if (this.employmentType === '') this.employmentType = undefined;
  
  // Skip candidate code generation if already set (done in controller)
  if (!this.candidateCode || this.candidateCode.trim() === '') {
    try {
      // Use timestamp-based approach for better performance
      // This avoids expensive database queries for code generation
      const timestamp = Date.now().toString().slice(-8);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      this.candidateCode = `CAN${timestamp}${random}`;
      
      console.log(`Generated candidate code: ${this.candidateCode} for ${this.email || 'new candidate'}`);
    } catch (error) {
      console.error('Error generating candidate code:', error);
      // Fallback to simple timestamp
      this.candidateCode = `CAN${Date.now().toString().slice(-8)}`;
    }
  }

  // Check for duplicates only if this is a new document and not already marked as duplicate
  if (this.isNew && !this.isDuplicate) {
    const Candidate = this.constructor;
    const normalizedPhone = normalizePhone(this.phone);
    const normalizedEmail = this.email?.toLowerCase().trim();

    // Check for existing candidate by email OR phone
    const duplicateQuery = {
      _id: { $ne: this._id },
      $or: []
    };

    if (normalizedEmail) {
      duplicateQuery.$or.push({ email: normalizedEmail });
    }

    if (normalizedPhone) {
      duplicateQuery.$or.push({ phone: normalizedPhone });
      // Also check alternatePhone
      duplicateQuery.$or.push({ alternatePhone: normalizedPhone });
    }

    if (duplicateQuery.$or.length > 0) {
      try {
        const duplicate = await Candidate.findOne(duplicateQuery).lean().exec();
        if (duplicate) {
          // Flag as duplicate but don't block save (non-blocking)
          this.isDuplicate = true;
          this.duplicateOf = duplicate._id;
        }
      } catch (dupError) {
        console.warn('Error checking for duplicates:', dupError);
        // Don't fail the save if duplicate check fails
      }
    }
  }

  next();
});

module.exports = mongoose.model('Candidate', candidateSchema);
