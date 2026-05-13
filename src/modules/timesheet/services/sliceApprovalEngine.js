const mongoose = require('mongoose');
const { getTimesheetModels } = require('../models/timesheetModels');
const { getLeaveModels } = require('../../leave/models/leaveModels');
const {
  TimesheetOverallStatus,
  SliceStatus,
  TimesheetEntrySource,
  TimesheetEntryType
} = require('../types/timesheet.types');

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date = new Date()) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

async function getProjectModel(connection) {
  const schema = require('../../../models/tenant/Project');
  return connection.models.Project || connection.model('Project', schema);
}

async function validateSubmission(connection, timesheet, entries) {
  const { LeaveRequest, Holiday } = getLeaveModels(connection);
  const dailyHours = new Map();
  const hardErrors = [];
  const warnings = [];

  if (!entries.length) hardErrors.push('Submitting with no entries is not allowed');
  if (timesheet.periodStart > startOfWeek(new Date())) hardErrors.push('Submitting for a future week is not allowed');

  for (const e of entries) {
    if (e.hours < 0) hardErrors.push(`Negative hours not allowed for ${new Date(e.entryDate).toDateString()}`);
    const key = new Date(e.entryDate).toISOString().slice(0, 10);
    const rowHours = Number(e.hours || 0);
    dailyHours.set(key, (dailyHours.get(key) || 0) + rowHours);
    // Project is required only for meaningful work rows
    if (rowHours > 0 && !e.projectId && e.entryType === TimesheetEntryType.WORK) {
      hardErrors.push(`Project is required for work entry on ${key}`);
    }
  }

  for (const [day, total] of dailyHours.entries()) {
    if (total > 24) hardErrors.push(`Daily hours exceed 24 on ${day}`);
    if (total > 10) warnings.push(`Daily hours exceed 10 on ${day}`);
  }

  const approvedLeaves = await LeaveRequest.find({
    appliedFor: timesheet.employeeId,
    status: 'approved',
    fromDate: { $lte: timesheet.periodEnd },
    toDate: { $gte: timesheet.periodStart }
  }).select('fromDate toDate');

  const leaveDates = new Set();
  approvedLeaves.forEach((lr) => {
    const cur = new Date(lr.fromDate);
    while (cur <= lr.toDate) {
      leaveDates.add(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
  });

  const holidays = await Holiday.find({
    date: { $gte: timesheet.periodStart, $lte: timesheet.periodEnd }
  }).select('date');
  const holidaySet = new Set(holidays.map((h) => new Date(h.date).toISOString().slice(0, 10)));

  for (const e of entries) {
    const day = new Date(e.entryDate).toISOString().slice(0, 10);
    if (leaveDates.has(day) && e.entryType === TimesheetEntryType.WORK) {
      hardErrors.push(`You have approved leave on ${day}. Cancel leave first.`);
    }
    if (holidaySet.has(day) && e.entryType === TimesheetEntryType.WORK) {
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
    { $set: { sliceStatus: SliceStatus.SUBMITTED } }
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
      sentBackReason: sendBackReason || null
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

async function ensureWeekTimesheet(connection, employeeId, weekDate = new Date()) {
  const { Timesheet } = getTimesheetModels(connection);
  const periodStart = startOfWeek(weekDate);
  const periodEnd = endOfWeek(weekDate);
  const timesheet =
    (await Timesheet.findOne({ employeeId, periodStart })) ||
    (await Timesheet.create({ employeeId, periodStart, periodEnd }));
  return timesheet;
}

async function autofillLeaveAndHolidays(connection, employeeId, weekDate = new Date()) {
  const { TimesheetEntry } = getTimesheetModels(connection);
  const { LeaveRequest, Holiday } = getLeaveModels(connection);
  const ts = await ensureWeekTimesheet(connection, employeeId, weekDate);

  const approvedLeaves = await LeaveRequest.find({
    appliedFor: employeeId,
    status: 'approved',
    fromDate: { $lte: ts.periodEnd },
    toDate: { $gte: ts.periodStart }
  }).select('fromDate toDate halfDay');

  for (const leave of approvedLeaves) {
    const cur = new Date(leave.fromDate);
    while (cur <= leave.toDate) {
      if (cur >= ts.periodStart && cur <= ts.periodEnd) {
        const existing = await TimesheetEntry.findOne({
          timesheetId: ts._id,
          entryDate: new Date(cur),
          source: TimesheetEntrySource.LEAVE_AUTOFILL
        });
        if (!existing) {
          await TimesheetEntry.create({
            timesheetId: ts._id,
            entryDate: new Date(cur),
            projectId: null,
            taskDescription: 'Auto-filled from approved leave',
            hours: leave.halfDay ? 4 : 8,
            entryType: TimesheetEntryType.LEAVE,
            isBillable: false,
            filledBy: employeeId,
            source: TimesheetEntrySource.LEAVE_AUTOFILL,
            sliceStatus: SliceStatus.APPROVED,
            isEditable: false
          });
        }
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  const holidays = await Holiday.find({ date: { $gte: ts.periodStart, $lte: ts.periodEnd }, isOptional: false }).select('date');
  for (const holiday of holidays) {
    const existing = await TimesheetEntry.findOne({
      timesheetId: ts._id,
      entryDate: holiday.date,
      source: TimesheetEntrySource.HOLIDAY_AUTOFILL
    });
    if (!existing) {
      await TimesheetEntry.create({
        timesheetId: ts._id,
        entryDate: holiday.date,
        projectId: null,
        taskDescription: 'Auto-filled public holiday',
        hours: 8,
        entryType: TimesheetEntryType.HOLIDAY,
        isBillable: false,
        filledBy: employeeId,
        source: TimesheetEntrySource.HOLIDAY_AUTOFILL,
        sliceStatus: SliceStatus.APPROVED,
        isEditable: false
      });
    }
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
  getProjectModel
};
