const mongoose = require('mongoose');
const {
  TimesheetOverallStatus,
  TimesheetEntryType,
  TimesheetEntrySource,
  SliceStatus
} = require('../types/timesheet.types');

const timesheetSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    periodStart: { type: Date, required: true, index: true },
    periodEnd: { type: Date, required: true },
    overallStatus: {
      type: String,
      enum: Object.values(TimesheetOverallStatus),
      default: TimesheetOverallStatus.DRAFT,
      index: true
    },
    submittedAt: { type: Date, default: null },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true, collection: 'timesheets_v2' }
);

timesheetSchema.index({ employeeId: 1, periodStart: 1 }, { unique: true });

const timesheetEntrySchema = new mongoose.Schema(
  {
    timesheetId: { type: mongoose.Schema.Types.ObjectId, ref: 'TimesheetV2', required: true, index: true },
    entryDate: { type: Date, required: true, index: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    taskDescription: { type: String, default: '' },
    hours: { type: Number, required: true, min: 0, max: 24 },
    entryType: { type: String, enum: Object.values(TimesheetEntryType), default: TimesheetEntryType.WORK },
    isBillable: { type: Boolean, default: true },
    filledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    source: { type: String, enum: Object.values(TimesheetEntrySource), default: TimesheetEntrySource.MANUAL },
    sliceStatus: { type: String, enum: Object.values(SliceStatus), default: SliceStatus.DRAFT, index: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    sentBackReason: { type: String, default: null },
    isEditable: { type: Boolean, default: true }
  },
  { timestamps: true, collection: 'timesheet_entries' }
);

timesheetEntrySchema.index({ timesheetId: 1, entryDate: 1, projectId: 1 });

const timesheetAuditSchema = new mongoose.Schema(
  {
    timesheetId: { type: mongoose.Schema.Types.ObjectId, ref: 'TimesheetV2', required: true, index: true },
    entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'TimesheetEntryV2', default: null },
    action: { type: String, required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, default: '' },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'timesheet_audit_log' }
);

const bulkUploadJobSchema = new mongoose.Schema(
  {
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fileUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ['processing', 'completed', 'completed_with_errors', 'failed'],
      default: 'processing'
    },
    totalRows: { type: Number, default: 0 },
    successfulRows: { type: Number, default: 0 },
    failedRows: { type: Number, default: 0 },
    errorReport: { type: [mongoose.Schema.Types.Mixed], default: [] }
  },
  { timestamps: true, collection: 'bulk_upload_jobs' }
);

function getTimesheetModels(connection) {
  const Timesheet = connection.models.TimesheetV2 || connection.model('TimesheetV2', timesheetSchema);
  const TimesheetEntry = connection.models.TimesheetEntryV2 || connection.model('TimesheetEntryV2', timesheetEntrySchema);
  const TimesheetAudit = connection.models.TimesheetAuditV2 || connection.model('TimesheetAuditV2', timesheetAuditSchema);
  const BulkUploadJob = connection.models.BulkUploadJobV2 || connection.model('BulkUploadJobV2', bulkUploadJobSchema);

  return { Timesheet, TimesheetEntry, TimesheetAudit, BulkUploadJob };
}

module.exports = { getTimesheetModels };
