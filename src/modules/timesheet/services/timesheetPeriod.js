const { getTimesheetModels } = require('../models/timesheetModels');

/** Parse YYYY-MM-DD (or ISO string) as a stable calendar date (UTC noon). */
function parseCalendarDate(input) {
  if (input == null || input === '') return new Date();
  if (typeof input === 'string') {
    const m = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
    }
  }
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

/** Monday 00:00:00.000 UTC for the calendar week containing `dateInput`. */
function startOfWeek(dateInput = new Date()) {
  const d = parseCalendarDate(dateInput);
  const day = d.getUTCDay();
  const mondayDate = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), mondayDate, 0, 0, 0, 0));
}

/** Sunday 23:59:59.999 UTC for the calendar week containing `dateInput`. */
function endOfWeek(dateInput = new Date()) {
  const start = startOfWeek(dateInput);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

async function ensureWeekTimesheet(connection, employeeId, weekDate = new Date()) {
  const { Timesheet } = getTimesheetModels(connection);
  const periodStart = startOfWeek(weekDate);
  const periodEnd = endOfWeek(weekDate);
  const nextMonday = new Date(periodStart);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

  let timesheet = await Timesheet.findOne({
    employeeId,
    periodStart: { $gte: periodStart, $lt: nextMonday }
  });

  if (!timesheet) {
    timesheet = await Timesheet.create({ employeeId, periodStart, periodEnd });
    return timesheet;
  }

  if (timesheet.periodStart?.getTime() !== periodStart.getTime()) {
    timesheet.periodStart = periodStart;
    timesheet.periodEnd = periodEnd;
    await timesheet.save();
  }

  return timesheet;
}

/** UTC calendar YYYY-MM-DD for an entry or period boundary. */
function calendarDayKeyUtc(dateInput) {
  const d = parseCalendarDate(dateInput);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function eachUtcDayKeyInRange(periodStart, periodEnd, fn) {
  const start = parseCalendarDate(calendarDayKeyUtc(periodStart));
  const end = parseCalendarDate(calendarDayKeyUtc(periodEnd));
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  let d = start.getUTCDate();
  const endY = end.getUTCFullYear();
  const endM = end.getUTCMonth();
  const endD = end.getUTCDate();
  for (;;) {
    const pastEnd = y > endY || (y === endY && m > endM) || (y === endY && m === endM && d > endD);
    if (pastEnd) break;
    fn(calendarDayKeyUtc(new Date(Date.UTC(y, m, d, 12, 0, 0, 0))));
    const next = new Date(Date.UTC(y, m, d + 1));
    y = next.getUTCFullYear();
    m = next.getUTCMonth();
    d = next.getUTCDate();
  }
}

module.exports = {
  parseCalendarDate,
  startOfWeek,
  endOfWeek,
  ensureWeekTimesheet,
  calendarDayKeyUtc,
  eachUtcDayKeyInRange
};
