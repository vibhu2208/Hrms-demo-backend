/**
 * Report Template Model
 * Reusable report templates for different report types
 */

const mongoose = require('mongoose');

const reportTemplateSchema = new mongoose.Schema({
  reportName: {
    type: String,
    required: [true, 'Report name is required'],
    trim: true,
    unique: true
  },
  reportType: {
    type: String,
    required: [true, 'Report type is required'],
    enum: ['leave', 'attendance', 'compliance', 'payroll', 'employee', 'custom'],
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  fields: [{
    fieldName: {
      type: String,
      required: true
    },
    displayName: {
      type: String,
      required: true
    },
    dataType: {
      type: String,
      enum: ['string', 'number', 'date', 'boolean', 'currency'],
      default: 'string'
    },
    isRequired: {
      type: Boolean,
      default: false
    },
    order: {
      type: Number,
      default: 0
    }
  }],
  filters: [{
    fieldName: {
      type: String,
      required: true
    },
    filterType: {
      type: String,
      enum: ['date_range', 'select', 'multi_select', 'text', 'number_range'],
      required: true
    },
    options: [String], // For select/multi_select
    defaultValue: mongoose.Schema.Types.Mixed,
    isRequired: {
      type: Boolean,
      default: false
    }
  }],
  grouping: [{
    fieldName: String,
    order: {
      type: String,
      enum: ['asc', 'desc'],
      default: 'asc'
    }
  }],
  sorting: [{
    fieldName: String,
    order: {
      type: String,
      enum: ['asc', 'desc'],
      default: 'asc'
    }
  }],
  scheduleConfig: {
    enabled: {
      type: Boolean,
      default: false
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom']
    },
    dayOfWeek: Number, // 0-6 for weekly
    dayOfMonth: Number, // 1-31 for monthly
    time: String, // HH:mm format
    recipients: [{
      email: String,
      role: String
    }]
  },
  exportFormat: {
    type: [String],
    enum: ['excel', 'pdf', 'csv', 'json'],
    default: ['excel']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
reportTemplateSchema.index({ reportType: 1, isActive: 1 });
reportTemplateSchema.index({ reportName: 1 }, { unique: true });

module.exports = mongoose.model('ReportTemplate', reportTemplateSchema);


