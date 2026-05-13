/**
 * Scheduled Report Model
 * Tracks scheduled report generation and distribution
 */

const mongoose = require('mongoose');

const scheduledReportSchema = new mongoose.Schema({
  reportTemplateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ReportTemplate',
    required: [true, 'Report template is required'],
    index: true
  },
  reportName: {
    type: String,
    required: true,
    trim: true
  },
  reportType: {
    type: String,
    required: true,
    enum: ['leave', 'attendance', 'compliance', 'payroll', 'employee', 'custom']
  },
  scheduleFrequency: {
    type: String,
    required: [true, 'Schedule frequency is required'],
    enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'],
    index: true
  },
  scheduleConfig: {
    dayOfWeek: Number, // 0-6 (Sunday-Saturday) for weekly
    dayOfMonth: Number, // 1-31 for monthly
    time: String, // HH:mm format
    timezone: {
      type: String,
      default: 'Asia/Kolkata'
    }
  },
  recipients: [{
    email: {
      type: String,
      required: true,
      lowercase: true
    },
    name: String,
    role: String
  }],
  filters: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  exportFormat: {
    type: String,
    enum: ['excel', 'pdf', 'csv'],
    default: 'excel'
  },
  lastRunAt: {
    type: Date,
    index: true
  },
  nextRunAt: {
    type: Date,
    required: true,
    index: true
  },
  lastRunStatus: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    default: 'pending'
  },
  lastRunError: {
    type: String
  },
  lastRunFileUrl: {
    type: String
  },
  runCount: {
    type: Number,
    default: 0
  },
  successCount: {
    type: Number,
    default: 0
  },
  failureCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
scheduledReportSchema.index({ isActive: 1, nextRunAt: 1 });
scheduledReportSchema.index({ reportType: 1, isActive: 1 });

module.exports = mongoose.model('ScheduledReport', scheduledReportSchema);


