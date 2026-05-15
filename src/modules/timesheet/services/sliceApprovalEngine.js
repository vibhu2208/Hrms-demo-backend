const mongoose = require('mongoose');
const { getTimesheetModels } = require('../models/timesheetModels');
const { getLeaveModels } = require('../../leave/models/leaveModels');
const {
  fetchHolidaysForRangeDocs,
  buildHolidayDateKeySet,
  expandActiveHolidayDocToKeysInRange,
  isMandatoryAutofillHoliday
} = require('../../leave/services/holidayRangeHelper');
const {
  TimesheetOverallStatus,
  SliceStatus,
  TimesheetEntrySource,
  TimesheetEntryType,
  AttendanceStatus
} = require('../types/timesheet.types');
const { LeaveRequestStatus } = require('../../leave/types/leave.types');
const { startOfWeek, endOfWeek, ensureWeekTimesheet } = require('./timesheetPeriod');
const {
  syncApprovedLeavesOverlappingWeek,
  pruneEntriesOutsideTimesheetWeek,
  STANDARD_SHIFT
} = require('./leaveTimesheetSync');
const { calendarDayKeyUtc, eachUtcDayKeyInRange, parseCalendarDate } = require('./timesheetPeriod');

async function getProjectModel(connection) {
  const schema = require('../../../models/tenant/Project');
  return connection.models.Project || connection.model('Project', schema);
}

function workedHoursForDailyCap(e) {
  const t = e.entryType || TimesheetEntryType.WORK;
  if (t === TimesheetEntryType.WORK) return Number(e.workedHours ?? e.hours ?? 0);
  return Number(e.workedHours ?? 0);
}

/** ISO `YYYY-MM-DD` keys for days covered by approved full-day leave (half-day leaves excluded). */
async function fetchFullDayApprovedLeaveDateKeys(connection, employeeId, rangeStart, rangeEnd) {
  const { LeaveRequest } = getLeaveModels(connection);
  const empId = mongoose.Types.ObjectId.isValid(employeeId)
    ? new mongoose.Types.ObjectId(String(employeeId))
    : employeeId;
  const approvedLeaves = await LeaveRequest.find({
    appliedFor: empId,
    status: LeaveRequestStatus.APPROVED,
    halfDay: { $ne: true },
    fromDate: { $lte: rangeEnd },
    toDate: { $gte: rangeStart }
  })
    .select('fromDate toDate')
    .lean();

  const leaveDates = new Set();
  approvedLeaves.forEach((lr) => {
    eachUtcDayKeyInRange(lr.fromDate, lr.toDate, (dayKey) => {
      if (dayKey >= calendarDayKeyUtc(rangeStart) && dayKey <= calendarDayKeyUtc(rangeEnd)) {
        leaveDates.add(dayKey);
      }
    });
  });
  return leaveDates;
}

async function validateSubmission(connection, timesheet, entries) {
  const { Holiday } = getLeaveModels(connection);
  const dailyHours = new Map();
  const hardErrors = [];
  const warnings = [];

  if (!entries.length) hardErrors.push('Submitting with no entries is not allowed');
  if (timesheet.periodStart > startOfWeek(new Date())) hardErrors.push('Submitting for a future week is not allowed');

  for (const e of entries) {
    const wh = workedHoursForDailyCap(e);
    if (wh < 0) hardErrors.push(`Negative worked hours not allowed for ${new Date(e.entryDate).toDateString()}`);
    const key = new Date(e.entryDate).toISOString().slice(0, 10);
    dailyHours.set(key, (dailyHours.get(key) || 0) + wh);
    if (wh > 0 && !e.projectId && e.entryType === TimesheetEntryType.WORK) {
      hardErrors.push(`Project is required for work entry on ${key}`);
    }
  }

  for (const [day, total] of dailyHours.entries()) {
    if (total > 24) hardErrors.push(`Daily worked hours exceed 24 on ${day}`);
    if (total > 10) warnings.push(`Daily worked hours exceed 10 on ${day}`);
  }

  const leaveDates = await fetchFullDayApprovedLeaveDateKeys(
    connection,
    timesheet.employeeId,
    timesheet.periodStart,
    timesheet.periodEnd
  );

  const holidayRows = await fetchHolidaysForRangeDocs(Holiday, timesheet.periodStart, timesheet.periodEnd);
  const holidaySet = buildHolidayDateKeySet(holidayRows, timesheet.periodStart, timesheet.periodEnd);

  for (const e of entries) {
    const day = new Date(e.entryDate).toISOString().slice(0, 10);
    if (leaveDates.has(day) && e.entryType === TimesheetEntryType.WORK && workedHoursForDailyCap(e) > 0) {
      hardErrors.push(`You have approved leave on ${day}. Cancel leave first.`);
    }
    if (holidaySet.has(day) && e.entryType === TimesheetEntryType.WORK && workedHoursForDailyCap(e) > 0) {
      warnings.push(`Entry on holiday ${day} will be treated as overtime work`);
    }
  }

  return { hardErrors, warnings };
}

async function submitTimesheet(connection, actor, timesheetId) {
  const { Timesheet, TimesheetEntry } = getTimesheetModels(connection);
  const ts = await Timesheet.findById(timesheetId);
  if (!ts) throw new Error('Timesheet not found');
  if (ts.overallStatus === TimesheetOverallStatus.LOCKED) throw new Error('Timesheet period is locked');
  if (ts.overallStatus === TimesheetOverallStatus.FULLY_APPROVED) {
    throw new Error('This timesheet is already fully approved.');
  }
  if (ts.overallStatus === TimesheetOverallStatus.SUBMITTED) {
    throw new Error('This timesheet is already submitted for approval.');
  }
  if (ts.overallStatus === TimesheetOverallStatus.PARTIALLY_APPROVED) {
    const canResubmit = await TimesheetEntry.exists({
      timesheetId: ts._id,
      sliceStatus: { $in: [SliceStatus.DRAFT, SliceStatus.SENT_BACK] }
    });
    if (!canResubmit) {
      throw new Error('Nothing to resubmit. Wait for your manager or update slices returned for correction.');
    }
  }

  const entries = await TimesheetEntry.find({ timesheetId: ts._id });
  const validation = await validateSubmission(connection, ts, entries);
  if (validation.hardErrors.length) {
    const err = new Error(validation.hardErrors.join('; '));
    err.warnings = validation.warnings;
    throw err;
  }

  ts.overallStatus = TimesheetOverallStatus.SUBMITTED;
  ts.submittedAt = new Date();
  await ts.save();

  await TimesheetEntry.updateMany(
    { timesheetId: ts._id, sliceStatus: { $in: [SliceStatus.DRAFT, SliceStatus.SENT_BACK] } },
    { $set: { sliceStatus: SliceStatus.SUBMITTED, isEditable: false } }
  );

  return { timesheet: ts, warnings: validation.warnings };
}

async function approveProjectSlice(connection, actor, timesheetId, projectId, sendBackReason = null) {
  const { Timesheet, TimesheetEntry } = getTimesheetModels(connection);
  const ts = await Timesheet.findById(timesheetId);
  if (!ts) throw new Error('Timesheet not found');

  const targetStatus = sendBackReason ? SliceStatus.SENT_BACK : SliceStatus.APPROVED;
  if (sendBackReason && !sendBackReason.trim()) throw new Error('Send-back reason is required');

  const query = {
    timesheetId: ts._id,
    projectId: projectId ? new mongoose.Types.ObjectId(projectId) : null,
    sliceStatus: { $in: [SliceStatus.SUBMITTED, SliceStatus.UNDER_REVIEW] }
  };

  const result = await TimesheetEntry.updateMany(query, {
    $set: {
      sliceStatus: targetStatus,
      approvedBy: sendBackReason ? null : actor._id,
      approvedAt: sendBackReason ? null : new Date(),
      sentBackReason: sendBackReason || null,
      isEditable: Boolean(sendBackReason)
    }
  });
  if (!result.modifiedCount) {
    throw new Error('Slice already actioned by another manager or not available');
  }

  const pending = await TimesheetEntry.countDocuments({
    timesheetId: ts._id,
    sliceStatus: { $in: [SliceStatus.SUBMITTED, SliceStatus.UNDER_REVIEW, SliceStatus.SENT_BACK, SliceStatus.DRAFT] }
  });
  ts.overallStatus = pending === 0 ? TimesheetOverallStatus.FULLY_APPROVED : TimesheetOverallStatus.PARTIALLY_APPROVED;
  await ts.save();
  return ts;
}

async function lockTimesheet(connection, actor, timesheetId) {
  const { Timesheet, TimesheetEntry } = getTimesheetModels(connection);
  const ts = await Timesheet.findById(timesheetId);
  if (!ts) throw new Error('Timesheet not found');
  if (ts.overallStatus !== TimesheetOverallStatus.FULLY_APPROVED) {
    throw new Error('Timesheet must be fully approved before lock');
  }
  ts.overallStatus = TimesheetOverallStatus.LOCKED;
  ts.lockedAt = new Date();
  ts.lockedBy = actor._id;
  await ts.save();
  await TimesheetEntry.updateMany({ timesheetId: ts._id }, { $set: { sliceStatus: SliceStatus.LOCKED, isEditable: false } });
  return ts;
}

async function autofillLeaveAndHolidays(connection, employeeId, weekDate = new Date()) {
  const { TimesheetEntry } = getTimesheetModels(connection);
  const { Holiday } = getLeaveModels(connection);
  const ts = await ensureWeekTimesheet(connection, employeeId, weekDate);

  await TimesheetEntry.deleteMany({
    timesheetId: ts._id,
    source: TimesheetEntrySource.LEAVE_AUTOFILL,
    $or: [{ leaveRequestId: { $exists: false } }, { leaveRequestId: null }]
  });

  await syncApprovedLeavesOverlappingWeek(connection, employeeId, ts.periodStart, ts.periodEnd);
  await pruneEntriesOutsideTimesheetWeek(connection, ts._id, ts.periodStart, ts.periodEnd);

  const holidayRows = await fetchHolidaysForRangeDocs(Holiday, ts.periodStart, ts.periodEnd);
  for (const holiday of holidayRows) {
    if (!isMandatoryAutofillHoliday(holiday)) continue;
    const dayKeys = expandActiveHolidayDocToKeysInRange(holiday, ts.periodStart, ts.periodEnd);
    for (const dayKey of dayKeys) {
      const holidayDate = new Date(`${dayKey}T12:00:00.000Z`);
      const existing = await TimesheetEntry.findOne({
        timesheetId: ts._id,
        entryDate: holidayDate,
        source: TimesheetEntrySource.HOLIDAY_AUTOFILL
      });
      if (!existing) {
        await TimesheetEntry.create({
          timesheetId: ts._id,
          entryDate: holidayDate,
          projectId: null,
          taskDescription: 'Auto-filled public holiday',
          hours: 0,
          workedHours: 0,
          payableHours: STANDARD_SHIFT,
          attendanceStatus: AttendanceStatus.HOLIDAY,
          entryType: TimesheetEntryType.HOLIDAY,
          isBillable: false,
          filledBy: employeeId,
          source: TimesheetEntrySource.HOLIDAY_AUTOFILL,
          sliceStatus: SliceStatus.APPROVED,
          isEditable: false
        });
      }
    }
  }

  const holidaySet = buildHolidayDateKeySet(holidayRows, ts.periodStart, ts.periodEnd);
  const weekDayKeys = [];
  eachUtcDayKeyInRange(ts.periodStart, ts.periodEnd, (dayKey) => weekDayKeys.push(dayKey));

  for (const dayKey of weekDayKeys) {
    const d = parseCalendarDate(dayKey);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) continue;
    if (holidaySet.has(dayKey)) continue;

    const existingWo = await TimesheetEntry.findOne({
      timesheetId: ts._id,
      entryDate: d,
      source: TimesheetEntrySource.WEEK_OFF_AUTOFILL
    });
    if (existingWo) continue;

    const blocking = await TimesheetEntry.findOne({
      timesheetId: ts._id,
      entryDate: d,
      $or: [
        { entryType: TimesheetEntryType.WORK, workedHours: { $gt: 0 } },
        { entryType: TimesheetEntryType.WORK, hours: { $gt: 0 } },
        { entryType: TimesheetEntryType.LEAVE },
        { entryType: TimesheetEntryType.HOLIDAY }
      ]
    });
    if (blocking) continue;

    await TimesheetEntry.create({
      timesheetId: ts._id,
      entryDate: d,
      projectId: null,
      taskDescription: 'Week off',
      hours: 0,
      workedHours: 0,
      payableHours: 0,
      attendanceStatus: AttendanceStatus.WEEK_OFF,
      entryType: TimesheetEntryType.WEEK_OFF,
      isBillable: false,
      filledBy: employeeId,
      source: TimesheetEntrySource.WEEK_OFF_AUTOFILL,
      sliceStatus: SliceStatus.APPROVED,
      isEditable: false
    });
  }

  return ts;
}

module.exports = {
  startOfWeek,
  endOfWeek,
  ensureWeekTimesheet,
  submitTimesheet,
  approveProjectSlice,
  lockTimesheet,
  autofillLeaveAndHolidays,
  getProjectModel,
  fetchFullDayApprovedLeaveDateKeys
};
