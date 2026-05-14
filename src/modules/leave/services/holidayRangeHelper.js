const { toDateOnly, dateKey } = require('./leaveCalculator');

/**
 * Expand a single holiday document into YYYY-MM-DD keys within [fromDate, toDate] (inclusive).
 * Excludes inactive. Uses UTC calendar parts for recurring alignment with leave calculator.
 */
function expandActiveHolidayDocToKeysInRange(doc, fromDate, toDate) {
  if (!doc || doc.status === 'inactive') return [];
  const from = toDateOnly(fromDate);
  const to = toDateOnly(toDate);
  const base = toDateOnly(doc.date);
  const keys = [];
  if (doc.isRecurringYearly) {
    const m = base.getUTCMonth();
    const d = base.getUTCDate();
    let y = from.getUTCFullYear();
    const endY = to.getUTCFullYear();
    for (; y <= endY; y += 1) {
      const occ = new Date(Date.UTC(y, m, d));
      const oc = toDateOnly(occ);
      if (oc >= from && oc <= to) keys.push(dateKey(oc));
    }
  } else if (base >= from && base <= to) {
    keys.push(dateKey(base));
  }
  return keys;
}

function holidayDateKeysForLeaveCalc(rows, fromDate, toDate) {
  const set = new Set();
  for (const row of rows) {
    for (const k of expandActiveHolidayDocToKeysInRange(row, fromDate, toDate)) {
      set.add(k);
    }
  }
  return [...set].map((k) => new Date(`${k}T00:00:00.000Z`));
}

/**
 * Load holidays that may affect the range: non-recurring in range, or any recurring (small set).
 */
async function fetchHolidaysForRangeDocs(Holiday, fromDate, toDate) {
  const from = toDateOnly(fromDate);
  const to = toDateOnly(toDate);
  return Holiday.find({
    status: { $ne: 'inactive' },
    $or: [{ isRecurringYearly: true }, { date: { $gte: from, $lte: to } }]
  }).lean();
}

function buildHolidayDateKeySet(rows, fromDate, toDate) {
  const set = new Set();
  for (const row of rows) {
    for (const k of expandActiveHolidayDocToKeysInRange(row, fromDate, toDate)) {
      set.add(k);
    }
  }
  return set;
}

/** Timesheet autofill: skip optional-type or optional-observance holidays */
function isMandatoryAutofillHoliday(doc) {
  if (!doc || doc.status === 'inactive') return false;
  if (doc.isOptional) return false;
  if (doc.holidayType === 'optional') return false;
  return true;
}

module.exports = {
  expandActiveHolidayDocToKeysInRange,
  holidayDateKeysForLeaveCalc,
  fetchHolidaysForRangeDocs,
  buildHolidayDateKeySet,
  isMandatoryAutofillHoliday
};
