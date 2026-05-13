const { LeaveGenderRestriction } = require('../types/leave.types');

const numericPolicyFields = [
  'maxCarryoverDays',
  'maxDaysPerRequest',
  'minNoticeDays',
  'attachmentRequiredAfterDays',
  'maxConsecutiveDays'
];

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeLeaveTypePayload(payload = {}) {
  const normalized = { ...payload };
  numericPolicyFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(normalized, field)) {
      normalized[field] = toNullableNumber(normalized[field]);
    }
  });
  if (
    Object.prototype.hasOwnProperty.call(normalized, 'minNoticeDays') &&
    (normalized.minNoticeDays === null || normalized.minNoticeDays === undefined)
  ) {
    normalized.minNoticeDays = 0;
  }
  return normalized;
}

function validateLeaveTypePolicy(payload) {
  const fields = normalizeLeaveTypePayload(payload);
  const validations = [
    ['minNoticeDays', 0],
    ['maxCarryoverDays', 0],
    ['maxDaysPerRequest', 0.5],
    ['attachmentRequiredAfterDays', 0.5],
    ['maxConsecutiveDays', 1]
  ];

  validations.forEach(([field, minValue]) => {
    if (fields[field] !== null && fields[field] !== undefined) {
      if (!Number.isFinite(fields[field]) || fields[field] < minValue) {
        throw new Error(`${field} must be at least ${minValue}`);
      }
    }
  });

  if (fields.carryoverAllowed === false) {
    fields.maxCarryoverDays = null;
  }

  if (fields.genderRestriction && !Object.values(LeaveGenderRestriction).includes(fields.genderRestriction)) {
    throw new Error('Invalid gender restriction');
  }

  return fields;
}

function getDifferenceInCalendarDays(fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function validateLeaveRequestPolicy({
  leaveType,
  employeeGender,
  employeeOnProbation,
  fromDate,
  toDate,
  durationDays,
  halfDay,
  attachmentUrl,
  today
}) {
  if (halfDay && !leaveType.allowHalfDay) {
    throw new Error('Half-day requests are not allowed for this leave type');
  }

  if (halfDay && new Date(fromDate).toISOString().slice(0, 10) !== new Date(toDate).toISOString().slice(0, 10)) {
    throw new Error('Half-day leave can only be applied for a single date');
  }

  if (
    leaveType.genderRestriction &&
    leaveType.genderRestriction !== LeaveGenderRestriction.ALL &&
    leaveType.genderRestriction !== (employeeGender || '').toLowerCase()
  ) {
    throw new Error('You are not eligible for this leave type based on gender policy');
  }

  if (leaveType.probationAllowed === false && employeeOnProbation) {
    throw new Error('Employees on probation are not allowed to apply for this leave type');
  }

  if (leaveType.maxDaysPerRequest && durationDays > leaveType.maxDaysPerRequest) {
    throw new Error(`This leave type allows maximum ${leaveType.maxDaysPerRequest} day(s) per request`);
  }

  if (leaveType.maxConsecutiveDays && durationDays > leaveType.maxConsecutiveDays) {
    throw new Error(`Consecutive leave cannot exceed ${leaveType.maxConsecutiveDays} day(s)`);
  }

  if (leaveType.minNoticeDays > 0) {
    const noticeDays = getDifferenceInCalendarDays(today, fromDate);
    if (noticeDays < leaveType.minNoticeDays) {
      throw new Error(`Leave must be applied at least ${leaveType.minNoticeDays} day(s) in advance`);
    }
  }

  const attachmentThresholdBreached =
    leaveType.attachmentRequiredAfterDays && durationDays > leaveType.attachmentRequiredAfterDays;
  if ((leaveType.requiresDocument || attachmentThresholdBreached) && !attachmentUrl) {
    throw new Error('Attachment is required based on this leave policy');
  }
}

module.exports = {
  normalizeLeaveTypePayload,
  validateLeaveTypePolicy,
  validateLeaveRequestPolicy
};
