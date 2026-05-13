/**
 * HR Activity Logging Service
 * Centralized service for logging HR activities
 */

const { getTenantModel } = require('../middlewares/tenantMiddleware');
const HRActivityHistorySchema = require('../models/tenant/HRActivityHistory');

/**
 * Helper function to get HR user details from request
 */
const getHRUserDetails = (req) => {
  if (!req || !req.user) {
    return null;
  }
  
  return {
    hrUserId: req.user.id || req.user._id,
    hrEmail: req.user.email,
    hrName: req.user.name || req.user.firstName && req.user.lastName ?
      `${req.user.firstName} ${req.user.lastName}` : req.user.email,
    role: req.user.role,
    ipAddress: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('User-Agent')
  };
};

/**
 * Log HR activity
 * @param {Object} tenantConnection - Tenant database connection
 * @param {Object} activityData - Activity data to log
 * @param {Object} req - Express request object (optional, for IP and user agent)
 */
const logHRActivity = async (tenantConnection, activityData, req) => {
  try {
    if (!tenantConnection) {
      console.warn('⚠️ Cannot log HR activity: No tenant connection provided');
      return;
    }

    const HRActivityHistory = getTenantModel(tenantConnection, 'HRActivityHistory');
    if (!HRActivityHistory) {
      console.warn('⚠️ Cannot log HR activity: HRActivityHistory model not available');
      return;
    }

    const logEntry = {
      ...activityData,
      timestamp: new Date(),
      // Add request metadata if available
      ...(req && {
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('User-Agent')
      })
    };

    if (!logEntry.metadata || typeof logEntry.metadata !== 'object') {
      logEntry.metadata = {};
    }

    const requestProjectId =
      req?.params?.projectId ||
      req?.params?.id ||
      req?.body?.projectId ||
      req?.query?.projectId ||
      null;

    if (requestProjectId && !logEntry.metadata.projectId && String(logEntry.entityType) === 'project') {
      logEntry.metadata.projectId = String(requestProjectId);
    }

    await HRActivityHistory.create(logEntry);
    console.log(`✅ HR activity logged: ${activityData.action} by ${logEntry.hrEmail || 'unknown'}`);
  } catch (error) {
    console.error('❌ Error logging HR activity:', error);
    // Don't throw - logging should not break the main flow
  }
};

/**
 * Log employee creation activity
 */
const logEmployeeCreated = async (tenantConnection, employee, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'employee_created',
    description: `Created employee: ${employee.firstName} ${employee.lastName} (${employee.employeeCode})`,
    entityType: 'employee',
    entityId: employee._id,
    entityName: `${employee.firstName} ${employee.lastName}`,
    metadata: {
      employeeCode: employee.employeeCode,
      designation: employee.designation,
      department: employee.department
    }
  }, req);
};

/**
 * Log employee update activity
 */
const logEmployeeUpdated = async (tenantConnection, employee, previousData, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'employee_updated',
    description: `Updated employee: ${employee.firstName} ${employee.lastName} (${employee.employeeCode})`,
    entityType: 'employee',
    entityId: employee._id,
    entityName: `${employee.firstName} ${employee.lastName}`,
    previousValue: previousData,
    newValue: employee,
    metadata: {
      employeeCode: employee.employeeCode
    }
  }, req);
};

/**
 * Log send to onboarding activity
 */
const logSendToOnboarding = async (tenantConnection, candidate, onboarding, req) => {
  try {
    const hrDetails = getHRUserDetails(req);
    if (!hrDetails) {
      console.warn('⚠️ Cannot log HR activity: HR user details not found in request');
      console.warn('Request user:', req?.user);
      return;
    }

    console.log(`📝 Logging send to onboarding activity for HR: ${hrDetails.hrEmail}`);

    await logHRActivity(tenantConnection, {
      ...hrDetails,
      action: 'send_to_onboarding',
      description: `Sent candidate ${candidate.firstName} ${candidate.lastName} to onboarding`,
      entityType: 'onboarding',
      entityId: onboarding._id,
      entityName: `${candidate.firstName} ${candidate.lastName}`,
      metadata: {
        candidateEmail: candidate.email,
        position: onboarding.position,
        onboardingId: onboarding.onboardingId
      }
    }, req);
  } catch (error) {
    console.error('❌ Error in logSendToOnboarding:', error);
    // Don't throw - logging should not break the main flow
  }
};

/**
 * Log onboarding completion activity
 */
const logOnboardingCompleted = async (tenantConnection, onboarding, employee, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'onboarding_completed',
    description: `Completed onboarding for ${onboarding.candidateName} and created employee ${employee.employeeCode}`,
    entityType: 'onboarding',
    entityId: onboarding._id,
    entityName: onboarding.candidateName,
    metadata: {
      employeeId: employee._id,
      employeeCode: employee.employeeCode,
      onboardingId: onboarding.onboardingId
    }
  }, req);
};

/**
 * Log onboarding status change
 */
const logOnboardingStatusChanged = async (tenantConnection, onboarding, previousStatus, newStatus, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'onboarding_status_changed',
    description: `Changed onboarding status for ${onboarding.candidateName} from ${previousStatus} to ${newStatus}`,
    entityType: 'onboarding',
    entityId: onboarding._id,
    entityName: onboarding.candidateName,
    previousValue: { status: previousStatus },
    newValue: { status: newStatus },
    metadata: {
      onboardingId: onboarding.onboardingId
    }
  }, req);
};

/**
 * Log document verification
 */
const logDocumentVerified = async (tenantConnection, onboarding, documentType, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'document_verified',
    description: `Verified ${documentType} document for ${onboarding.candidateName}`,
    entityType: 'onboarding',
    entityId: onboarding._id,
    entityName: onboarding.candidateName,
    metadata: {
      documentType,
      onboardingId: onboarding.onboardingId
    }
  }, req);
};

/**
 * Log offer sent
 */
const logOfferSent = async (tenantConnection, onboarding, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'offer_sent',
    description: `Sent offer letter to ${onboarding.candidateName}`,
    entityType: 'onboarding',
    entityId: onboarding._id,
    entityName: onboarding.candidateName,
    metadata: {
      onboardingId: onboarding.onboardingId,
      position: onboarding.position
    }
  }, req);
};

/**
 * Log offer extended (used for various offer sending scenarios)
 */
const logOfferExtended = async (tenantConnection, data, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  const entityType = data.onboardingId ? 'onboarding' : 'candidate';

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'offer_sent',
    description: `Sent offer letter to ${data.candidateName}`,
    entityType,
    entityId: data._id,
    entityName: data.candidateName,
    metadata: {
      candidateEmail: data.candidateEmail,
      position: data.position,
      onboardingId: data.onboardingId
    }
  }, req);
};

/**
 * Log candidate shortlisted
 */
const logCandidateShortlisted = async (tenantConnection, candidate, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'candidate_shortlisted',
    description: `Shortlisted candidate: ${candidate.firstName} ${candidate.lastName}`,
    entityType: 'candidate',
    entityId: candidate._id,
    entityName: `${candidate.firstName} ${candidate.lastName}`,
    metadata: {
      candidateEmail: candidate.email,
      jobTitle: candidate.appliedFor?.title
    }
  }, req);
};

/**
 * Log job posting created
 */
const logJobPostingCreated = async (tenantConnection, jobPosting, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'job_posting_created',
    description: `Created job posting: ${jobPosting.title}`,
    entityType: 'job_posting',
    entityId: jobPosting._id,
    entityName: jobPosting.title,
    metadata: {
      department: jobPosting.department,
      location: jobPosting.location
    }
  }, req);
};

/**
 * Log bulk upload
 */
const logBulkUpload = async (tenantConnection, uploadType, recordCount, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'bulk_upload',
    description: `Performed bulk upload: ${uploadType} (${recordCount} records)`,
    entityType: 'other',
    metadata: {
      uploadType,
      recordCount
    }
  }, req);
};

/**
 * Log employee deletion
 */
const logEmployeeDeleted = async (tenantConnection, employee, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'employee_deleted',
    description: `Deleted employee: ${employee.firstName} ${employee.lastName} (${employee.employeeCode})`,
    entityType: 'employee',
    entityId: employee._id,
    entityName: `${employee.firstName} ${employee.lastName}`,
    metadata: {
      employeeCode: employee.employeeCode
    }
  }, req);
};

/**
 * Log candidate creation
 */
const logCandidateCreated = async (tenantConnection, candidate, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'candidate_created',
    description: `Created candidate: ${candidate.firstName} ${candidate.lastName}`,
    entityType: 'candidate',
    entityId: candidate._id,
    entityName: `${candidate.firstName} ${candidate.lastName}`,
    metadata: {
      candidateCode: candidate.candidateCode,
      source: candidate.source
    }
  }, req);
};

/**
 * Log candidate stage change
 */
const logCandidateStageChanged = async (tenantConnection, candidate, previousStage, newStage, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'candidate_stage_changed',
    description: `Changed candidate stage from ${previousStage} to ${newStage}: ${candidate.firstName} ${candidate.lastName}`,
    entityType: 'candidate',
    entityId: candidate._id,
    entityName: `${candidate.firstName} ${candidate.lastName}`,
    previousValue: { stage: previousStage },
    newValue: { stage: newStage },
    metadata: {
      candidateCode: candidate.candidateCode
    }
  }, req);
};

/**
 * Log user creation
 */
const logUserCreated = async (tenantConnection, user, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'user_created',
    description: `Created user: ${user.firstName} ${user.lastName} (${user.email})`,
    entityType: 'user',
    entityId: user._id,
    entityName: `${user.firstName} ${user.lastName}`,
    metadata: {
      userEmail: user.email,
      userRole: user.role
    }
  }, req);
};

/**
 * Log user status change
 */
const logUserStatusChanged = async (tenantConnection, user, previousStatus, newStatus, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'user_status_changed',
    description: `${newStatus ? 'Activated' : 'Deactivated'} user: ${user.firstName} ${user.lastName} (${user.email})`,
    entityType: 'user',
    entityId: user._id,
    entityName: `${user.firstName} ${user.lastName}`,
    previousValue: { isActive: previousStatus },
    newValue: { isActive: newStatus },
    metadata: {
      userEmail: user.email,
      userRole: user.role
    }
  }, req);
};

/**
 * Log user deletion
 */
const logUserDeleted = async (tenantConnection, user, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'user_deleted',
    description: `Deleted user: ${user.firstName} ${user.lastName} (${user.email})`,
    entityType: 'user',
    entityId: user._id,
    entityName: `${user.firstName} ${user.lastName}`,
    metadata: {
      userEmail: user.email,
      userRole: user.role
    }
  }, req);
};

/**
 * Log offboarding creation
 */
const logOffboardingCreated = async (tenantConnection, offboarding, employee, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'offboarding_created',
    description: `Initiated offboarding for employee: ${employee.firstName} ${employee.lastName} (${employee.employeeCode})`,
    entityType: 'offboarding',
    entityId: offboarding._id,
    entityName: `${employee.firstName} ${employee.lastName}`,
    metadata: {
      employeeCode: employee.employeeCode,
      resignationDate: offboarding.resignationDate,
      lastWorkingDate: offboarding.lastWorkingDate
    }
  }, req);
};

/**
 * Log offboarding status change
 */
const logOffboardingStatusChanged = async (tenantConnection, offboarding, previousStatus, newStatus, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'offboarding_status_changed',
    description: `Changed offboarding status from ${previousStatus} to ${newStatus} for ${offboarding.employeeName}`,
    entityType: 'offboarding',
    entityId: offboarding._id,
    entityName: offboarding.employeeName,
    previousValue: { status: previousStatus },
    newValue: { status: newStatus },
    metadata: {
      employeeCode: offboarding.employeeCode
    }
  }, req);
};

/**
 * Log department creation
 */
const logDepartmentCreated = async (tenantConnection, department, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'department_created',
    description: `Created department: ${department.name}`,
    entityType: 'department',
    entityId: department._id,
    entityName: department.name,
    metadata: {
      departmentCode: department.code,
      headCount: department.headCount || 0
    }
  }, req);
};

/**
 * Log department update
 */
const logDepartmentUpdated = async (tenantConnection, department, previousData, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'department_updated',
    description: `Updated department: ${department.name}`,
    entityType: 'department',
    entityId: department._id,
    entityName: department.name,
    previousValue: previousData,
    newValue: department,
    metadata: {
      departmentCode: department.code
    }
  }, req);
};

/**
 * Log leave approval/rejection
 */
const logLeaveAction = async (tenantConnection, leave, action, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  const actionText = action === 'approved' ? 'Approved' : 'Rejected';

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: `leave_${action}`,
    description: `${actionText} leave request for ${leave.employeeName} (${leave.leaveType})`,
    entityType: 'leave',
    entityId: leave._id,
    entityName: leave.employeeName,
    metadata: {
      leaveType: leave.leaveType,
      startDate: leave.startDate,
      endDate: leave.endDate,
      days: leave.totalDays
    }
  }, req);
};

/**
 * Log attendance modification
 */
const logAttendanceModified = async (tenantConnection, attendance, action, req) => {
  const hrDetails = getHRUserDetails(req);
  if (!hrDetails) return;

  await logHRActivity(tenantConnection, {
    ...hrDetails,
    action: 'attendance_modified',
    description: `${action} attendance for ${attendance.employeeName} on ${attendance.date}`,
    entityType: 'attendance',
    entityId: attendance._id,
    entityName: attendance.employeeName,
    metadata: {
      date: attendance.date,
      action: action,
      employeeCode: attendance.employeeCode
    }
  }, req);
};

module.exports = {
  getHRUserDetails,
  logEmployeeCreated,
  logEmployeeUpdated,
  logEmployeeDeleted,
  logSendToOnboarding,
  logOnboardingCompleted,
  logOnboardingStatusChanged,
  logDocumentVerified,
  logOfferSent,
  logOfferExtended,
  logCandidateCreated,
  logCandidateStageChanged,
  logCandidateShortlisted,
  logUserCreated,
  logUserStatusChanged,
  logUserDeleted,
  logOffboardingCreated,
  logOffboardingStatusChanged,
  logDepartmentCreated,
  logDepartmentUpdated,
  logLeaveAction,
  logAttendanceModified,
  logJobPostingCreated,
  logBulkUpload
};
