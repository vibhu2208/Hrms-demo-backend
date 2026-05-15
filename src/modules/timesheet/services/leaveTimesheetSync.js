const mongoose = require('mongoose');
const { getLeaveModels } = require('../../leave/models/leaveModels');
const { getTimesheetModels } = require('../models/timesheetModels');
const { LeaveRequestStatus } = require('../../leave/types/leave.types');
const {
  TimesheetEntrySource,
  TimesheetEntryType,
  SliceStatus,
  AttendanceStatus
} = require('../types/timesheet.types');
const {
  ensureWeekTimesheet,
  parseCalendarDate,
  calendarDayKeyUtc,
  eachUtcDayKeyInRange
} = require('./timesheetPeriod');

/** Hours per full paid day / holiday (env optional; must be a sane positive number). */
const STANDARD_SHIFT = (() => {
  const n = Number(process.env.TIMESHEET_STANDARD_SHIFT_HOURS);
  if (Number.isFinite(n) && n > 0 && n <= 24) return n;
  return 8;
})();

/**
 * Leave types default to paid when `isPaid` is missing (matches LeaveType schema default and legacy docs).
 * Only explicit `false` / 0 / 'false' / '0' counts as unpaid.
 */
function resolveLeaveTypeIsPaid(leaveType) {
  if (!leaveType || typeof leaveType !== 'object') return true;
  const v = leaveType.isPaid;
  if (v === false || v === 0 || v === '0') return false;
  if (typeof v === 'string' && v.trim().toLowerCase() === 'false') return false;
  return true;
}

function utcNoonFromDayKey(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

function dayKeyInLeaveRange(dayKey, fromDate, toDate) {
  const key = calendarDayKeyUtc(parseCalendarDate(dayKey));
  const fromKey = calendarDayKeyUtc(fromDate);
  const toKey = calendarDayKeyUtc(toDate);
  return key >= fromKey && key <= toKey;
}

async function eachUtcCalendarDayAsync(fromDate, toDate, fn) {
  const fromKey = calendarDayKeyUtc(fromDate);
  const toKey = calendarDayKeyUtc(toDate);
  const keys = [];
  eachUtcDayKeyInRange(fromKey, toKey, (k) => keys.push(k));
  for (const dayKey of keys) {
    await fn(utcNoonFromDayKey(dayKey), dayKey);
  }
}

/**
 * Idempotent: sync approved leave rows onto the correct weekly timesheet(s).
 * @param {{ periodStart?: Date, periodEnd?: Date }} [weekBounds] When set, only touch this calendar week (used on week load).
 */
async function syncLeaveRequestToTimesheets(connection, leaveRequestId, weekBounds = null) {
  const { LeaveRequest, LeaveType } = getLeaveModels(connection);
  const { TimesheetEntry } = getTimesheetModels(connection);

  const lr = await LeaveRequest.findById(leaveRequestId);
  if (!lr) return { ok: false, reason: 'leave_not_found' };

  if (lr.status !== LeaveRequestStatus.APPROVED) {
    await TimesheetEntry.deleteMany({
      leaveRequestId: lr._id,
      source: TimesheetEntrySource.LEAVE_AUTOFILL
    });
    return { ok: true, cleared: true };
  }

  const leaveType = await LeaveType.findById(lr.leaveTypeId).lean();
  if (!leaveType) return { ok: false, reason: 'leave_type_not_found' };

  if (weekBounds?.periodStart && weekBounds?.periodEnd) {
    const ts = await ensureWeekTimesheet(connection, lr.appliedFor, weekBounds.periodStart);
    await TimesheetEntry.deleteMany({
      timesheetId: ts._id,
      leaveRequestId: lr._id,
      source: TimesheetEntrySource.LEAVE_AUTOFILL
    });
  } else {
    await TimesheetEntry.deleteMany({
      leaveRequestId: lr._id,
      source: TimesheetEntrySource.LEAVE_AUTOFILL
    });
  }

  const isPaid = resolveLeaveTypeIsPaid(leaveType);
  const halfShift = Number((STANDARD_SHIFT / 2).toFixed(2));
  const payableForDay = lr.halfDay ? (isPaid ? halfShift : 0) : isPaid ? STANDARD_SHIFT : 0;
  const attendance = lr.halfDay
    ? AttendanceStatus.HALF_DAY_LEAVE
    : isPaid
      ? AttendanceStatus.PAID_LEAVE
      : AttendanceStatus.UNPAID_LEAVE;

  const remarksParts = [leaveType.name || 'Leave'];
  if (lr.reason) remarksParts.push(String(lr.reason).trim());
  const remarks = remarksParts.join(' — ').slice(0, 2000);

  const rangeStart = weekBounds?.periodStart || lr.fromDate;
  const rangeEnd = weekBounds?.periodEnd || lr.toDate;

  await eachUtcCalendarDayAsync(rangeStart, rangeEnd, async (entryDate, dayKey) => {
    if (!dayKeyInLeaveRange(dayKey, lr.fromDate, lr.toDate)) return;

    const ts = await ensureWeekTimesheet(connection, lr.appliedFor, entryDate);

    await TimesheetEntry.deleteMany({
      timesheetId: ts._id,
      leaveRequestId: lr._id,
      source: TimesheetEntrySource.LEAVE_AUTOFILL,
      entryDate
    });

    await TimesheetEntry.create({
      timesheetId: ts._id,
      entryDate,
      projectId: null,
      taskDescription: leaveType.name || 'Approved leave',
      hours: 0,
      workedHours: 0,
      payableHours: Number(payableForDay),
      attendanceStatus: attendance,
      leaveTypeId: leaveType._id,
      leaveRequestId: lr._id,
      isPaidLeave: isPaid,
      remarks,
      entryType: TimesheetEntryType.LEAVE,
      isBillable: false,
      filledBy: lr.appliedFor,
      source: TimesheetEntrySource.LEAVE_AUTOFILL,
      sliceStatus: SliceStatus.APPROVED,
      isEditable: false
    });
  });

  return { ok: true };
}

/**
 * Re-sync approved leave overlapping this timesheet week only (does not disturb other weeks).
 */
async function syncApprovedLeavesOverlappingWeek(connection, employeeId, periodStart, periodEnd) {
  const { LeaveRequest } = getLeaveModels(connection);
  const empId = mongoose.Types.ObjectId.isValid(employeeId) ? new mongoose.Types.ObjectId(String(employeeId)) : employeeId;
  const ids = await LeaveRequest.find({
    appliedFor: empId,
    status: LeaveRequestStatus.APPROVED,
    fromDate: { $lte: periodEnd },
    toDate: { $gte: periodStart }
  }).distinct('_id');

  const weekBounds = { periodStart, periodEnd };
  for (const id of ids) {
    await syncLeaveRequestToTimesheets(connection, id, weekBounds);
  }
}

/**
 * Remove system rows on a timesheet whose calendar day falls outside that timesheet's week.
 */
async function pruneEntriesOutsideTimesheetWeek(connection, timesheetId, periodStart, periodEnd) {
  const { TimesheetEntry } = getTimesheetModels(connection);
  const validKeys = new Set();
  eachUtcDayKeyInRange(periodStart, periodEnd, (k) => validKeys.add(k));

  const rows = await TimesheetEntry.find({
    timesheetId,
    source: {
      $in: [
        TimesheetEntrySource.LEAVE_AUTOFILL,
        TimesheetEntrySource.HOLIDAY_AUTOFILL,
        TimesheetEntrySource.WEEK_OFF_AUTOFILL
      ]
    }
  }).select('entryDate');

  const orphanIds = rows
    .filter((r) => !validKeys.has(calendarDayKeyUtc(r.entryDate)))
    .map((r) => r._id);

  if (orphanIds.length) {
    await TimesheetEntry.deleteMany({ _id: { $in: orphanIds } });
  }
}

module.exports = {
  syncLeaveRequestToTimesheets,
  syncApprovedLeavesOverlappingWeek,
  pruneEntriesOutsideTimesheetWeek,
  STANDARD_SHIFT
};
