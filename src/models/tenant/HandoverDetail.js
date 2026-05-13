const mongoose = require('mongoose');

/**
 * Handover Detail Model - Project and knowledge transfer data
 * Phase 1: Module Setup & Data Model
 */
const handoverDetailSchema = new mongoose.Schema({
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

  // Successor Information
  successorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  temporaryAssigneeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  handoverType: {
    type: String,
    enum: ['direct_successor', 'temporary_assignment', 'team_distribution', 'manager_takeover'],
    default: 'direct_successor'
  },

  // Project Handovers
  projects: [{
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project'
    },
    projectName: String,
    currentStatus: {
      type: String,
      enum: ['not_started', 'in_progress', 'on_hold', 'completed', 'cancelled']
    },
    completionPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    handoverTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    deadline: Date,
    keyTasks: [String],
    pendingItems: [String],
    risksAndIssues: [String],
    handoverNotes: String,
    documentsLocation: String,
    handoverStatus: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending'
    },
    handoverDate: Date
  }],

  // Client Relationships
  clientRelationships: [{
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client'
    },
    clientName: String,
    relationshipType: {
      type: String,
      enum: ['primary_contact', 'secondary_contact', 'technical_lead', 'account_manager']
    },
    handoverTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    keyContacts: [{
      name: String,
      designation: String,
      email: String,
      phone: String,
      relationship: String
    }],
    ongoingIssues: [String],
    upcomingMeetings: [{
      title: String,
      date: Date,
      attendees: [String],
      agenda: String
    }],
    handoverNotes: String,
    handoverStatus: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending'
    }
  }],

  // Knowledge Transfer
  knowledgeItems: [{
    category: {
      type: String,
      enum: ['processes', 'systems', 'contacts', 'documentation', 'passwords', 'other']
    },
    title: String,
    description: String,
    importance: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    documentLocation: String,
    accessInstructions: String,
    transferredTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    transferStatus: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending'
    },
    transferDate: Date,
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    verificationDate: Date
  }],

  // System Access and Credentials
  systemAccess: [{
    systemName: String,
    accessLevel: String,
    username: String,
    hasSharedAccounts: Boolean,
    sharedWith: [String],
    transferRequired: Boolean,
    transferTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    accessRevoked: Boolean,
    revokedDate: Date,
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    notes: String
  }],

  // Documentation and Files
  documents: [{
    category: {
      type: String,
      enum: ['project_docs', 'process_docs', 'client_docs', 'personal_notes', 'other']
    },
    fileName: String,
    fileLocation: String,
    fileUrl: String,
    description: String,
    importance: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    transferredTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    transferStatus: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Handover Sessions
  handoverSessions: [{
    sessionDate: Date,
    duration: Number, // in minutes
    attendees: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    }],
    topics: [String],
    sessionNotes: String,
    actionItems: [{
      item: String,
      assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
      },
      dueDate: Date,
      status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed'],
        default: 'pending'
      }
    }],
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    }
  }],

  // Overall Status
  overallStatus: {
    type: String,
    enum: ['not_started', 'in_progress', 'review', 'completed'],
    default: 'not_started'
  },
  completionPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  // Approval and Sign-off
  managerApproval: {
    approved: Boolean,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    approvedAt: Date,
    comments: String
  },
  successorConfirmation: {
    confirmed: Boolean,
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    confirmedAt: Date,
    comments: String
  },

  // Timeline
  plannedStartDate: Date,
  plannedCompletionDate: Date,
  actualStartDate: Date,
  actualCompletionDate: Date,

  // Additional Notes
  generalNotes: String,
  specialInstructions: String,
  risksAndConcerns: [String]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
handoverDetailSchema.index({ offboardingRequestId: 1 });
handoverDetailSchema.index({ employeeId: 1, clientId: 1 });
handoverDetailSchema.index({ successorId: 1 });
handoverDetailSchema.index({ overallStatus: 1 });

// Virtual for project completion percentage
handoverDetailSchema.virtual('projectsCompletionPercentage').get(function() {
  if (!this.projects || this.projects.length === 0) return 100;
  const completed = this.projects.filter(p => p.handoverStatus === 'completed').length;
  return Math.round((completed / this.projects.length) * 100);
});

// Virtual for knowledge transfer completion
handoverDetailSchema.virtual('knowledgeTransferCompletion').get(function() {
  if (!this.knowledgeItems || this.knowledgeItems.length === 0) return 100;
  const completed = this.knowledgeItems.filter(k => k.transferStatus === 'completed').length;
  return Math.round((completed / this.knowledgeItems.length) * 100);
});

// Virtual for overall completion
handoverDetailSchema.virtual('overallCompletion').get(function() {
  const projectCompletion = this.projectsCompletionPercentage;
  const knowledgeCompletion = this.knowledgeTransferCompletion;
  const clientCompletion = this.clientRelationships.length > 0 
    ? Math.round((this.clientRelationships.filter(c => c.handoverStatus === 'completed').length / this.clientRelationships.length) * 100)
    : 100;
  
  return Math.round((projectCompletion + knowledgeCompletion + clientCompletion) / 3);
});

// Pre-save middleware
handoverDetailSchema.pre('save', function(next) {
  // Update overall completion percentage
  this.completionPercentage = this.overallCompletion;
  
  // Update overall status based on completion
  if (this.completionPercentage === 100) {
    this.overallStatus = 'completed';
    if (!this.actualCompletionDate) {
      this.actualCompletionDate = new Date();
    }
  } else if (this.completionPercentage > 0) {
    if (this.overallStatus === 'not_started') {
      this.overallStatus = 'in_progress';
      if (!this.actualStartDate) {
        this.actualStartDate = new Date();
      }
    }
  }

  next();
});

// Static methods
handoverDetailSchema.statics.getByEmployee = function(employeeId, clientId) {
  return this.findOne({ employeeId, clientId })
    .populate('successorId', 'firstName lastName email')
    .populate('temporaryAssigneeId', 'firstName lastName email');
};

handoverDetailSchema.statics.getBySuccessor = function(successorId, clientId) {
  return this.find({ successorId, clientId })
    .populate('employeeId', 'firstName lastName email')
    .sort({ createdAt: -1 });
};

handoverDetailSchema.statics.getPendingHandovers = function(clientId) {
  return this.find({
    clientId,
    overallStatus: { $in: ['not_started', 'in_progress'] }
  }).populate('employeeId', 'firstName lastName email')
    .populate('successorId', 'firstName lastName email');
};

module.exports = handoverDetailSchema;
