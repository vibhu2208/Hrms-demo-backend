const mongoose = require('mongoose');

const timesheetSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  weekStartDate: {
    type: Date,
    required: true
  },
  weekEndDate: {
    type: Date,
    required: true
  },
  entries: [{
    date: {
      type: Date,
      required: true
    },
    hours: {
      type: Number,
      required: true,
      min: 0,
      max: 24
    },
    taskDescription: String,
    billable: {
      type: Boolean,
      default: true
    }
  }],
  totalHours: {
    type: Number,
    default: 0
  },
  totalBillableHours: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'approved', 'rejected', 'invoiced'],
    default: 'draft'
  },
  submittedAt: Date,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  approvedAt: Date,
  rejectionReason: String,
  notes: String,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Calculate total hours before saving
timesheetSchema.pre('save', function(next) {
  this.totalHours = this.entries.reduce((sum, entry) => sum + entry.hours, 0);
  this.totalBillableHours = this.entries
    .filter(entry => entry.billable)
    .reduce((sum, entry) => sum + entry.hours, 0);
  next();
});

// Create compound index
timesheetSchema.index({ employee: 1, weekStartDate: 1 });

module.exports = mongoose.model('Timesheet', timesheetSchema);
