const mongoose = require('mongoose');

const hrActivityHistorySchema = new mongoose.Schema({
  // HR User who performed the action
  hrUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // HR User details (cached for quick access)
  hrName: {
    type: String,
    required: true
  },
  hrEmail: {
    type: String,
    required: true
  },
  
  // Action type
  action: {
    type: String,
    required: true,
    enum: [
      'send_to_onboarding',
      'candidate_created',
      'candidate_stage_changed',
      'employee_created',
      'employee_updated',
      'employee_deleted',
      'onboarding_completed',
      'onboarding_status_changed',
      'document_verified',
      'document_rejected',
      'offer_sent',
      'offer_accepted',
      'candidate_shortlisted',
      'candidate_rejected',
      'interview_scheduled',
      'interview_feedback_added',
      'job_posting_created',
      'job_posting_updated',
      'job_posting_closed',
      'bulk_upload',
      'user_created',
      'user_updated',
      'user_status_changed',
      'user_deleted',
      'user_deactivated',
      'offboarding_created',
      'offboarding_status_changed',
      'department_created',
      'department_updated',
      'leave_approved',
      'leave_rejected',
      'attendance_modified',
      'attendance_marked',
      'other'
    ]
  },
  
  // Action description
  description: {
    type: String,
    required: true
  },
  
  // Related entity information
  entityType: {
    type: String,
    enum: ['employee', 'candidate', 'onboarding', 'job_posting', 'user', 'department', 'leave', 'attendance', 'offboarding', 'project', 'other'],
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  entityName: {
    type: String,
    required: false // e.g., "John Doe" for employee, "Software Engineer" for job posting
  },
  
  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Previous and new values (for updates)
  previousValue: {
    type: mongoose.Schema.Types.Mixed
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Timestamp
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  
  // IP address and user agent for audit purposes
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
hrActivityHistorySchema.index({ hrUserId: 1, timestamp: -1 });
hrActivityHistorySchema.index({ action: 1, timestamp: -1 });
hrActivityHistorySchema.index({ entityType: 1, entityId: 1 });
hrActivityHistorySchema.index({ timestamp: -1 });

// Static method to log HR activity
hrActivityHistorySchema.statics.logActivity = function(data) {
  const {
    hrUserId,
    hrName,
    hrEmail,
    action,
    description,
    entityType,
    entityId,
    entityName,
    metadata,
    previousValue,
    newValue,
    ipAddress,
    userAgent
  } = data;
  
  return this.create({
    hrUserId,
    hrName,
    hrEmail,
    action,
    description,
    entityType,
    entityId,
    entityName,
    metadata: metadata || {},
    previousValue,
    newValue,
    ipAddress,
    userAgent,
    timestamp: new Date()
  });
};

// Static method to get HR activity timeline
hrActivityHistorySchema.statics.getHRTimeline = async function(filters = {}) {
  try {
    const {
      hrUserId,
      action,
      entityType,
      startDate,
      endDate,
      limit = 100,
      skip = 0
    } = filters;

    const query = {};

    if (hrUserId) {
      query.hrUserId = hrUserId;
    }

    if (action) {
      query.action = action;
    }

    if (entityType) {
      query.entityType = entityType;
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          query.timestamp.$gte = start;
        }
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          query.timestamp.$lte = end;
        }
      }
    }

    return await this.find(query)
      .populate('hrUserId', 'firstName lastName email role')
      .sort({ timestamp: -1 })
      .limit(Math.min(parseInt(limit) || 100, 1000)) // Cap at 1000 for safety
      .skip(Math.max(parseInt(skip) || 0, 0));
  } catch (error) {
    console.error('Error in getHRTimeline query:', error);
    // Return empty array on error to prevent 500 errors
    return [];
  }
};

// Static method to get activity statistics
hrActivityHistorySchema.statics.getActivityStats = async function(filters = {}) {
  try {
    const { hrUserId, startDate, endDate } = filters;

    const matchQuery = {};
    if (hrUserId) matchQuery.hrUserId = hrUserId;
    if (startDate || endDate) {
      matchQuery.timestamp = {};
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          matchQuery.timestamp.$gte = start;
        }
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          matchQuery.timestamp.$lte = end;
        }
      }
    }

    return await this.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
  } catch (error) {
    console.error('Error in getActivityStats aggregation:', error);
    // Return empty array on error to prevent 500 errors
    return [];
  }
};

module.exports = hrActivityHistorySchema;
