const mongoose = require('mongoose');
const {
  LeaveResetCycle,
  LeaveGenderRestriction,
  LeaveRequestStatus,
  LeaveHalfDayPeriod,
  LeaveAuditAction,
  LeaveAllocationType
} = require('../types/leave.types');

const leaveTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isPaid: { type: Boolean, default: true },
    carryoverAllowed: { type: Boolean, default: false },
    maxCarryoverDays: { type: Number, default: null },
    resetCycle: {
      type: String,
      enum: Object.values(LeaveResetCycle),
      default: LeaveResetCycle.YEARLY
    },
    requiresDocument: { type: Boolean, default: false },
    maxDaysPerRequest: { type: Number, default: null, min: 0.5 },
    minNoticeDays: { type: Number, default: 0 },
    allowHalfDay: { type: Boolean, default: false },
    genderRestriction: {
      type: String,
      enum: Object.values(LeaveGenderRestriction),
      default: LeaveGenderRestriction.ALL
    },
    probationAllowed: { type: Boolean, default: true },
    attachmentRequiredAfterDays: { type: Number, default: null, min: 0.5 },
    sandwichPolicyApplicable: { type: Boolean, default: false },
    countWeekends: { type: Boolean, default: false },
    maxConsecutiveDays: { type: Number, default: null, min: 1 },
    autoApproval: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true, collection: 'leave_types' }
);

const leaveAllocationSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    leaveTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveTypeV2', required: true, index: true },
    year: { type: Number, required: true, index: true },
    totalAllocated: { type: Number, required: true, min: 0 },
    used: { type: Number, default: 0, min: 0 },
    pending: { type: Number, default: 0, min: 0 },
    overrideNote: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    allocationType: {
      type: String,
      enum: Object.values(LeaveAllocationType),
      default: LeaveAllocationType.EMPLOYEE_SPECIFIC,
      index: true
    },
    allocationBatchId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    allocationTargeting: {
      departmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
      /** @deprecated Generic job titles; use roles for HRMS role-based allocation */
      designations: [{ type: String, trim: true }],
      /** Tenant User.role targets for designation_wise allocation (hr, manager, employee) */
      roles: [{ type: String, enum: ['employee', 'hr', 'manager'], trim: true }],
      branches: [{ type: String, trim: true }]
    }
  },
  { timestamps: true, collection: 'leave_allocations', toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

leaveAllocationSchema.index({ employeeId: 1, leaveTypeId: 1, year: 1 }, { unique: true });
leaveAllocationSchema.virtual('available').get(function available() {
  return Number((this.totalAllocated - this.used - this.pending).toFixed(2));
});

const leaveRequestSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    leaveTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveTypeV2', required: true },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    durationDays: { type: Number, required: true, min: 0.5 },
    halfDay: { type: Boolean, default: false },
    halfDayPeriod: {
      type: String,
      enum: Object.values(LeaveHalfDayPeriod),
      default: undefined,
      required: function requiredHalfDayPeriod() {
        return this.halfDay === true;
      }
    },
    status: { type: String, enum: Object.values(LeaveRequestStatus), default: LeaveRequestStatus.DRAFT, index: true },
    appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    appliedFor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason: { type: String, default: '' },
    attachmentUrl: { type: String, default: null },
    actionedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actionedAt: { type: Date, default: null },
    actionNote: { type: String, default: null },
    escalatedToAdmin: { type: Boolean, default: false, index: true },
    escalatedAt: { type: Date, default: null },
    escalationDeadlineAt: { type: Date, default: null }
  },
  { timestamps: true, collection: 'leave_requests' }
);

leaveRequestSchema.index({ appliedFor: 1, status: 1, fromDate: 1, toDate: 1 });

const leaveRequestAuditSchema = new mongoose.Schema(
  {
    leaveRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequestV2', required: true, index: true },
    action: { type: String, enum: Object.values(LeaveAuditAction), required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, default: '' },
    previousStatus: { type: String, default: '' },
    newStatus: { type: String, default: '' }
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'leave_request_audit_log' }
);

const HolidayType = ['national', 'regional', 'company', 'optional'];
const HolidayStatus = ['active', 'inactive'];

const holidaySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    date: { type: Date, required: true, index: true },
    /** Employee-level optional observance (in addition to type) */
    isOptional: { type: Boolean, default: false },
    /** National / regional / company-wide / optional category */
    holidayType: { type: String, enum: HolidayType, default: 'company' },
    /** Same calendar date every year (leave & timesheet expansion) */
    isRecurringYearly: { type: Boolean, default: false },
    status: { type: String, enum: HolidayStatus, default: 'active' },
    location: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true, collection: 'holidays' }
);

holidaySchema.index({ date: 1, location: 1 }, { unique: true });
holidaySchema.index({ status: 1, date: 1 });

function getLeaveModels(connection) {
  const LeaveType = connection.models.LeaveTypeV2 || connection.model('LeaveTypeV2', leaveTypeSchema);
  const LeaveAllocation =
    connection.models.LeaveAllocationV2 || connection.model('LeaveAllocationV2', leaveAllocationSchema);
  const LeaveRequest = connection.models.LeaveRequestV2 || connection.model('LeaveRequestV2', leaveRequestSchema);
  const LeaveRequestAudit =
    connection.models.LeaveRequestAuditV2 || connection.model('LeaveRequestAuditV2', leaveRequestAuditSchema);
  const Holiday = connection.models.HolidayV2 || connection.model('HolidayV2', holidaySchema);

  return { LeaveType, LeaveAllocation, LeaveRequest, LeaveRequestAudit, Holiday };
}

module.exports = { getLeaveModels };
