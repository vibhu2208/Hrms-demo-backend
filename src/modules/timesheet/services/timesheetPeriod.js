const { getTimesheetModels } = require('../models/timesheetModels');

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

async function ensureWeekTimesheet(connection, employeeId, weekDate = new Date()) {
  const { Timesheet } = getTimesheetModels(connection);
  const periodStart = startOfWeek(weekDate);
  const periodEnd = endOfWeek(weekDate);
  const timesheet =
    (await Timesheet.findOne({ employeeId, periodStart })) ||
    (await Timesheet.create({ employeeId, periodStart, periodEnd }));
  return timesheet;
}

module.exports = { startOfWeek, endOfWeek, ensureWeekTimesheet };
