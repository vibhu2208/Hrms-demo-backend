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

/** How a leave balance row was applied (bulk targeting or manual delta). */
const LeaveAllocationType = Object.freeze({
  COMPANY_WIDE: 'company_wide',
  /** `designation_wise` targets tenant User.role (hr, manager, employee); API key kept for compatibility */
  DESIGNATION_WISE: 'designation_wise',
  EMPLOYEE_SPECIFIC: 'employee_specific',
  MANUAL_ADJUSTMENT: 'manual_adjustment'
});

module.exports = {
  LeaveResetCycle,
  LeaveGenderRestriction,
  LeaveRequestStatus,
  LeaveHalfDayPeriod,
  LeaveAuditAction,
  LeaveAllocationType
};
