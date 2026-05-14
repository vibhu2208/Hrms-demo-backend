const TimesheetOverallStatus = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  PARTIALLY_APPROVED: 'partially_approved',
  FULLY_APPROVED: 'fully_approved',
  LOCKED: 'locked'
});

const TimesheetEntryType = Object.freeze({
  WORK: 'work',
  LEAVE: 'leave',
  HOLIDAY: 'holiday',
  WEEK_OFF: 'week_off',
  TRAINING: 'training',
  INTERNAL: 'internal'
});

const TimesheetEntrySource = Object.freeze({
  MANUAL: 'manual',
  BULK_UPLOAD: 'bulk_upload',
  LEAVE_AUTOFILL: 'leave_autofill',
  HOLIDAY_AUTOFILL: 'holiday_autofill',
  WEEK_OFF_AUTOFILL: 'week_off_autofill'
});

/** Payroll / attendance classification for a day-level slice */
const AttendanceStatus = Object.freeze({
  PRESENT: 'present',
  PAID_LEAVE: 'paid_leave',
  UNPAID_LEAVE: 'unpaid_leave',
  HALF_DAY_LEAVE: 'half_day_leave',
  HOLIDAY: 'holiday',
  WEEK_OFF: 'week_off',
  TRAINING: 'training',
  INTERNAL: 'internal'
});

const SliceStatus = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  SENT_BACK: 'sent_back',
  LOCKED: 'locked'
});

module.exports = {
  TimesheetOverallStatus,
  TimesheetEntryType,
  TimesheetEntrySource,
  SliceStatus,
  AttendanceStatus
};
