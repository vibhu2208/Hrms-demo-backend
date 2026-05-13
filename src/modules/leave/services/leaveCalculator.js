function toDateOnly(dateLike) {
  const d = new Date(dateLike);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function dateKey(date) {
  return toDateOnly(date).toISOString().slice(0, 10);
}

function getDatesBetween(fromDate, toDate) {
  const dates = [];
  let current = toDateOnly(fromDate);
  const end = toDateOnly(toDate);
  while (current <= end) {
    dates.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function calculateLeaveDuration({
  fromDate,
  toDate,
  halfDay,
  holidays = [],
  countWeekends = false,
  sandwichPolicyApplicable = false
}) {
  if (halfDay) {
    return 0.5;
  }

  const holidaySet = new Set(holidays.map((d) => dateKey(d)));
  const allDays = getDatesBetween(fromDate, toDate);
  const dayMeta = allDays.map((date) => {
    const holiday = holidaySet.has(dateKey(date));
    const weekend = isWeekend(date);
    const chargeableByDefault = !holiday && (countWeekends ? true : !weekend);
    return { date, chargeableByDefault, holiday, weekend };
  });

  let chargedDays = dayMeta.filter((d) => d.chargeableByDefault).length;

  if (sandwichPolicyApplicable) {
    dayMeta.forEach((item, index) => {
      if (item.chargeableByDefault) return;
      const hasChargeableBefore = dayMeta.slice(0, index).some((d) => d.chargeableByDefault);
      const hasChargeableAfter = dayMeta.slice(index + 1).some((d) => d.chargeableByDefault);
      if (hasChargeableBefore && hasChargeableAfter) {
        chargedDays += 1;
      }
    });
  }

  return Number(chargedDays.toFixed(2));
}

module.exports = { calculateLeaveDuration, getDatesBetween, toDateOnly, dateKey };
