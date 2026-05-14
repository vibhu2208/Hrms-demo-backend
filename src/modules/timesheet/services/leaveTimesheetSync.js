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
const { ensureWeekTimesheet, startOfWeek } = require('./timesheetPeriod');

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

function utcNoon(y, m, d) {
  return new Date(Date.UTC(y, m, d, 12, 0, 0, 0));
}

async function eachUtcCalendarDayAsync(fromDate, toDate, fn) {
  let y = fromDate.getUTCFullYear();
  let m = fromDate.getUTCMonth();
  let d = fromDate.getUTCDate();
  const endY = toDate.getUTCFullYear();
  const endM = toDate.getUTCMonth();
  const endD = toDate.getUTCDate();
  for (;;) {
    const cur = utcNoon(y, m, d);
    const pastEnd = y > endY || (y === endY && m > endM) || (y === endY && m === endM && d > endD);
    if (pastEnd) break;
    await fn(cur);
    const next = new Date(Date.UTC(y, m, d + 1));
    y = next.getUTCFullYear();
    m = next.getUTCMonth();
    d = next.getUTCDate();
  }
}

/**
 * Idempotent: removes all auto rows for this request, then recreates if still approved.
 */
async function syncLeaveRequestToTimesheets(connection, leaveRequestId) {
  const { LeaveRequest, LeaveType } = getLeaveModels(connection);
  const { Timesheet, TimesheetEntry } = getTimesheetModels(connection);

  const lr = await LeaveRequest.findById(leaveRequestId);
  if (!lr) return { ok: false, reason: 'leave_not_found' };

  await TimesheetEntry.deleteMany({
    leaveRequestId: lr._id,
    source: TimesheetEntrySource.LEAVE_AUTOFILL
  });

  if (lr.status !== LeaveRequestStatus.APPROVED) {
    return { ok: true, cleared: true };
  }

  const leaveType = await LeaveType.findById(lr.leaveTypeId).lean();
  if (!leaveType) return { ok: false, reason: 'leave_type_not_found' };

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

  await eachUtcCalendarDayAsync(lr.fromDate, lr.toDate, async (entryDate) => {
    await ensureWeekTimesheet(connection, lr.appliedFor, entryDate);
    const ts = await Timesheet.findOne({ employeeId: lr.appliedFor, periodStart: startOfWeek(entryDate) });
    if (!ts) return;

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
 * Re-sync every approved leave overlapping the timesheet week (fixes edits and keeps rows current).
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

  for (const id of ids) {
    await syncLeaveRequestToTimesheets(connection, id);
  }
}

module.exports = {
  syncLeaveRequestToTimesheets,
  syncApprovedLeavesOverlappingWeek,
  STANDARD_SHIFT
};
