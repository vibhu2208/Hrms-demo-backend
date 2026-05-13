/**
 * Roster Change Request Model - Stored in tenant database
 * Handles roster change requests with approval workflow
 */

const mongoose = require('mongoose');

const rosterChangeRequestSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Employee ID is required']
  },
  employeeEmail: {
    type: String,
    required: true,
    lowercase: true
  },
  employeeName: {
    type: String,
    required: true
  },
  currentScheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RosterAssignment'
  },
  currentShiftTemplateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShiftTemplate'
  },
  requestedScheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkSchedule'
  },
  requestedShiftTemplateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShiftTemplate',
    required: [true, 'Requested shift template is required']
  },
  requestedDate: {
    type: Date,
    required: [true, 'Requested date is required']
  },
  reason: {
    type: String,
    required: [true, 'Reason is required'],
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending'
  },
  // Approval workflow
  reportingManager: {
    type: String,
    lowercase: true
  },
  approvals: [{
    approverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approverEmail: {
      type: String,
      lowercase: true
    },
    approverName: {
      type: String
    },
    level: {
      type: Number,
      default: 1
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    comments: {
      type: String
    },
    approvedAt: {
      type: Date
    },
    rejectedAt: {
      type: Date
    }
  }],
  // Final approval details
  approvedBy: {
    type: String
  },
  approvedByEmail: {
    type: String,
    lowercase: true
  },
  approvedOn: {
    type: Date
  },
  rejectionReason: {
    type: String
  },
  rejectedBy: {
    type: String
  },
  rejectedByEmail: {
    type: String,
    lowercase: true
  },
  rejectedOn: {
    type: Date
  },
  appliedOn: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
rosterChangeRequestSchema.index({ employeeEmail: 1, status: 1 });
rosterChangeRequestSchema.index({ reportingManager: 1, status: 1 });
rosterChangeRequestSchema.index({ requestedDate: 1 });
rosterChangeRequestSchema.index({ appliedOn: -1 });

module.exports = rosterChangeRequestSchema;


