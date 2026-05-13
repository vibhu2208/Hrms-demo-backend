const LeaveResetCycle = Object.freeze({
  MONTHLY: 'monthly',
  YEARLY: 'yearly'
});

const LeaveGenderRestriction = Object.freeze({
  ALL: 'all',
  MALE: 'male',
  FEMALE: 'female',
  OTHER: 'other'
});

const LeaveRequestStatus = Object.freeze({
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  WITHDRAWN: 'withdrawn'
});

const LeaveHalfDayPeriod = Object.freeze({
  MORNING: 'morning',
  AFTERNOON: 'afternoon'
});

const LeaveAuditAction = Object.freeze({
  CREATED: 'created',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
  CANCELLED: 'cancelled',
  ESCALATED: 'escalated',
  OVERRIDDEN: 'overridden'
});

module.exports = {
  LeaveResetCycle,
  LeaveGenderRestriction,
  LeaveRequestStatus,
  LeaveHalfDayPeriod,
  LeaveAuditAction
};
