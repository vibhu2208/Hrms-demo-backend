const mongoose = require('mongoose');
const { getLeaveModels } = require('../models/leaveModels');
const { calculateLeaveDuration, toDateOnly } = require('./leaveCalculator');
const { holidayDateKeysForLeaveCalc, fetchHolidaysForRangeDocs } = require('./holidayRangeHelper');
const { LeaveRequestStatus, LeaveAuditAction } = require('../types/leave.types');
const { validateLeaveRequestPolicy } = require('./leavePolicy');
const { createNotification } = require('../../../controllers/notificationController');
const { syncLeaveRequestToTimesheets } = require('../../timesheet/services/leaveTimesheetSync');

const DEFAULT_SLA_HOURS = Number(process.env.LEAVE_SLA_HOURS || 48);

function isAdmin(role) {
  return role === 'admin' || role === 'company_admin';
}

async function getTenantUserModel(connection) {
  const schema = require('../../../models/tenant/TenantUser');
  return connection.models.User || connection.model('User', schema);
}

async function getProjectModel(connection) {
  const schema = require('../../../models/tenant/Project');
  return connection.models.Project || connection.model('Project', schema);
}

async function getProjectAssignmentModel(connection) {
  return (
    connection.models.ProjectAssignment ||
    connection.model('ProjectAssignment', new mongoose.Schema({}, { strict: false }), 'projectassignments')
  );
}

async function getTenantEmployeeModel(connection) {
  const schema = require('../../../models/tenant/TenantEmployee');
  return connection.models.Employee || connection.model('Employee', schema);
}

/**
 * Leave types may set autoApproval for low-touch employee requests.
 * HR, managers, and company admins must always go through the normal approval queue.
 */
function shouldAutoApproveThisRequest(leaveType, subjectUserRole) {
  if (!leaveType?.autoApproval) return false;
  return subjectUserRole === 'employee';
}

async function getEligibleManagers(connection, employeeId) {
  const User = await getTenantUserModel(connection);
  const Project = await getProjectModel(connection);
  const ProjectAssignment = await getProjectAssignmentModel(connection);
  const employeeIdStr = String(employeeId);

  // 1) Project assignments are the primary source in SPC flows
  const assignmentRows = await ProjectAssignment.find({
    userId: { $in: [employeeId, employeeIdStr] },
    isActive: { $ne: false }
  }).select('projectId');

  const assignedProjectIds = assignmentRows
    .map((row) => row.projectId)
    .filter(Boolean)
    .map((id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null))
    .filter(Boolean);

  // 2) Keep teamMembers/projectManager fallback for mixed data
  const fallbackProjects = await Project.find({
    $or: [
      { 'teamMembers.employee': employeeId },
      { 'teamMembers.userId': { $in: [employeeId, employeeIdStr] } },
      { projectManager: employeeId },
      { projectManager: employeeIdStr },
      { assignedManagers: { $in: [employeeIdStr, employeeId] } },
      { assignedHRs: { $in: [employeeIdStr, employeeId] } }
    ]
  }).select('_id');

  const projectIdSet = new Set([
    ...assignedProjectIds.map((id) => String(id)),
    ...fallbackProjects.map((p) => String(p._id))
  ]);

  const projectIds = [...projectIdSet].map((id) => new mongoose.Types.ObjectId(id));
  const managerIds = new Set();

  if (projectIds.length > 0) {
    const projects = await Project.find({ _id: { $in: projectIds } }).select('_id projectManager assignedManagers');

    projects.forEach((p) => {
      if (p.projectManager) managerIds.add(String(p.projectManager));
      if (Array.isArray(p.assignedManagers)) {
        p.assignedManagers.forEach((m) => managerIds.add(String(m)));
      }
    });

    const assignments = await ProjectAssignment.find({
      projectId: { $in: [...projectIds, ...projectIds.map((id) => String(id))] },
      role: 'manager',
      isActive: { $ne: false }
    }).select('userId');

    assignments.forEach((a) => {
      if (a.userId) managerIds.add(String(a.userId));
    });
  }

  managerIds.delete(String(employeeId));

  const empUser = await User.findById(employeeId).select('reportingManager').lean();
  if (empUser?.reportingManager) {
    const rmEmail = String(empUser.reportingManager).trim().toLowerCase();
    if (rmEmail) {
      const rmUser = await User.findOne({ email: rmEmail, isActive: { $ne: false } }).select('_id role').lean();
      if (
        rmUser &&
        ['manager', 'company_admin', 'admin'].includes(rmUser.role) &&
        String(rmUser._id) !== String(employeeId)
      ) {
        managerIds.add(String(rmUser._id));
      }
    }
  }

  return [...managerIds].map((id) => new mongoose.Types.ObjectId(id));
}

/** True when TenantUser.reportingManager resolves to an active approver (manager / admin roles). */
async function hasReportingManagerApprover(connection, employeeId) {
  const User = await getTenantUserModel(connection);
  const empUser = await User.findById(employeeId).select('reportingManager').lean();
  if (!empUser?.reportingManager) return false;
  const rmEmail = String(empUser.reportingManager).trim().toLowerCase();
  if (!rmEmail) return false;
  const rmUser = await User.findOne({ email: rmEmail, isActive: { $ne: false } }).select('_id role').lean();
  if (!rmUser || String(rmUser._id) === String(employeeId)) return false;
  return ['manager', 'company_admin', 'admin'].includes(rmUser.role);
}

async function hasAnyActiveProjectAssignment(connection, employeeId) {
  const Project = await getProjectModel(connection);
  const ProjectAssignment = await getProjectAssignmentModel(connection);
  const employeeIdStr = String(employeeId);

  const directAssignments = await ProjectAssignment.countDocuments({
    userId: { $in: [employeeId, employeeIdStr] },
    isActive: { $ne: false }
  });
  if (directAssignments > 0) {
    return true;
  }

  const fallbackCount = await Project.countDocuments({
    $or: [
      { 'teamMembers.employee': employeeId },
      { 'teamMembers.userId': { $in: [employeeId, employeeIdStr] } },
      { projectManager: employeeId },
      { projectManager: employeeIdStr },
      { assignedManagers: { $in: [employeeIdStr, employeeId] } },
      { assignedHRs: { $in: [employeeIdStr, employeeId] } }
    ]
  });
  return fallbackCount > 0;
}

async function writeAudit(connection, payload) {
  const { LeaveRequestAudit } = getLeaveModels(connection);
  await LeaveRequestAudit.create(payload);
}

async function submitLeaveRequest(connection, actor, input) {
  const { LeaveType, LeaveAllocation, LeaveRequest, Holiday } = getLeaveModels(connection);
  const User = await getTenantUserModel(connection);
  const Employee = await getTenantEmployeeModel(connection);
  const actorId = actor._id;
  const appliedFor = new mongoose.Types.ObjectId(input.appliedFor || actorId);
  const employee = await User.findById(appliedFor).select('_id role firstName lastName employeeId');
  if (!employee) throw new Error('Employee not found');

  const leaveType = await LeaveType.findById(input.leaveTypeId);
  if (!leaveType || leaveType.isArchived) throw new Error('Leave type not available');

  const hasProjectMembership = await hasAnyActiveProjectAssignment(connection, employee._id);
  const hasRmApprover = await hasReportingManagerApprover(connection, employee._id);
  if (!hasProjectMembership && !hasRmApprover) {
    throw new Error(
      'You are not assigned to any active project and no valid reporting manager is configured. Contact Admin.'
    );
  }
  const managers = employee.role === 'manager' ? [] : await getEligibleManagers(connection, employee._id);

  const fromDate = toDateOnly(input.fromDate);
  const toDate = toDateOnly(input.toDate);
  if (toDate < fromDate) throw new Error('Invalid date range');

  const holidayRows = await fetchHolidaysForRangeDocs(Holiday, fromDate, toDate);
  const holidays = holidayDateKeysForLeaveCalc(holidayRows, fromDate, toDate);
  const employeeProfile = employee.employeeId
    ? await Employee.findById(employee.employeeId).select('gender status')
    : null;

  const durationDays = calculateLeaveDuration({
    fromDate,
    toDate,
    halfDay: Boolean(input.halfDay),
    holidays,
    countWeekends: leaveType.countWeekends,
    sandwichPolicyApplicable: leaveType.sandwichPolicyApplicable
  });
  if (durationDays <= 0) throw new Error('No leave duration after weekend/holiday exclusion');

  validateLeaveRequestPolicy({
    leaveType,
    employeeGender: employeeProfile?.gender,
    employeeOnProbation: employeeProfile?.status === 'probation',
    fromDate,
    toDate,
    durationDays,
    halfDay: Boolean(input.halfDay),
    attachmentUrl: input.attachmentUrl,
    today: toDateOnly(new Date())
  });

  const autoApproveNow = shouldAutoApproveThisRequest(leaveType, employee.role);

  const year = fromDate.getUTCFullYear();
  let allocation = null;
  if (leaveType.isPaid) {
    allocation = await LeaveAllocation.findOne({
      employeeId: employee._id,
      leaveTypeId: leaveType._id,
      year
    });
    if (!allocation) throw new Error('No leave allocation configured for this employee and year');

    const available = allocation.totalAllocated - allocation.used - allocation.pending;
    if (available < durationDays) throw new Error('Insufficient leave balance');

    if (autoApproveNow) {
      allocation.used = Number((allocation.used + durationDays).toFixed(2));
    } else {
      allocation.pending = Number((allocation.pending + durationDays).toFixed(2));
    }
    await allocation.save();
  }

  const escalationDeadlineAt = new Date(Date.now() + DEFAULT_SLA_HOURS * 60 * 60 * 1000);
  const targetStatus = autoApproveNow ? LeaveRequestStatus.APPROVED : LeaveRequestStatus.PENDING;
  const leaveRequest = await LeaveRequest.create({
    employeeId: employee._id,
    leaveTypeId: leaveType._id,
    fromDate,
    toDate,
    durationDays,
    halfDay: Boolean(input.halfDay),
    halfDayPeriod: input.halfDay ? input.halfDayPeriod || undefined : undefined,
    status: targetStatus,
    appliedBy: actorId,
    appliedFor: employee._id,
    reason: input.reason || '',
    attachmentUrl: input.attachmentUrl || null,
    escalatedToAdmin: false,
    escalationDeadlineAt: autoApproveNow ? null : escalationDeadlineAt,
    actionedBy: autoApproveNow ? actorId : null,
    actionedAt: autoApproveNow ? new Date() : null,
    actionNote: autoApproveNow ? 'Auto-approved based on leave policy' : null
  });

  await writeAudit(connection, {
    leaveRequestId: leaveRequest._id,
    action: LeaveAuditAction.CREATED,
    performedBy: actorId,
    note: autoApproveNow ? 'Leave request auto-approved by policy' : 'Leave request submitted',
    previousStatus: '',
    newStatus: targetStatus
  });

  if (autoApproveNow) {
    await writeAudit(connection, {
      leaveRequestId: leaveRequest._id,
      action: LeaveAuditAction.APPROVED,
      performedBy: actorId,
      note: 'Policy configured for auto approval',
      previousStatus: LeaveRequestStatus.PENDING,
      newStatus: LeaveRequestStatus.APPROVED
    });
    await syncLeaveRequestToTimesheets(connection, leaveRequest._id);
    return leaveRequest;
  }

  if (employee.role === 'manager') {
    const admins = await User.find({ role: { $in: ['admin', 'company_admin'] }, isActive: true }).select('_id');
    await Promise.all(
      admins.map((admin) =>
        createNotification(connection, {
          recipient: admin._id,
          type: 'leave-request',
          title: 'Manager leave request pending',
          message: `Manager leave request needs your approval`,
          relatedEntity: { entityType: 'LeaveRequestV2', entityId: leaveRequest._id }
        })
      )
    );
  } else {
    if (managers.length > 0) {
      await Promise.all(
        managers.map((managerId) =>
          createNotification(connection, {
            recipient: managerId,
            type: 'leave-request',
            title: 'Leave request pending action',
            message: `${employee.firstName || 'Employee'} submitted a leave request`,
            relatedEntity: { entityType: 'LeaveRequestV2', entityId: leaveRequest._id }
          })
        )
      );
    } else {
      // All managers inactive/unavailable: directly escalate to admin
      const admins = await User.find({ role: { $in: ['admin', 'company_admin'] }, isActive: true }).select('_id');
      leaveRequest.escalatedToAdmin = true;
      leaveRequest.escalatedAt = new Date();
      await leaveRequest.save();

      await writeAudit(connection, {
        leaveRequestId: leaveRequest._id,
        action: LeaveAuditAction.ESCALATED,
        performedBy: actorId,
        note: 'No active managers found. Escalated directly to admin.',
        previousStatus: LeaveRequestStatus.PENDING,
        newStatus: LeaveRequestStatus.PENDING
      });

      await Promise.all(
        admins.map((admin) =>
          createNotification(connection, {
            recipient: admin._id,
            type: 'leave-request',
            title: 'Leave request escalated to admin',
            message: `${employee.firstName || 'Employee'} leave request requires admin action`,
            relatedEntity: { entityType: 'LeaveRequestV2', entityId: leaveRequest._id }
          })
        )
      );
    }
  }

  return leaveRequest;
}

async function actionLeaveRequest(connection, actor, requestId, decision, note) {
  const { LeaveRequest, LeaveAllocation } = getLeaveModels(connection);
  const User = await getTenantUserModel(connection);
  const request = await LeaveRequest.findById(requestId);
  if (!request) throw new Error('Leave request not found');
  if (request.status !== LeaveRequestStatus.PENDING) throw new Error('Leave request already actioned');

  const requester = await User.findById(request.appliedFor).select('_id role');
  const isRequesterManager = requester?.role === 'manager';
  if (isRequesterManager && !isAdmin(actor.role)) {
    throw new Error('Manager leave requests can only be approved/rejected by admin');
  }
  if (!isRequesterManager && !['manager', 'admin', 'company_admin'].includes(actor.role)) {
    throw new Error('Only manager/admin can action this leave request');
  }

  const newStatus = decision === 'approve' ? LeaveRequestStatus.APPROVED : LeaveRequestStatus.REJECTED;
  if (newStatus === LeaveRequestStatus.REJECTED && !note) {
    throw new Error('Rejection note is required');
  }

  const updated = await LeaveRequest.findOneAndUpdate(
    { _id: requestId, status: LeaveRequestStatus.PENDING },
    {
      $set: {
        status: newStatus,
        actionedBy: actor._id,
        actionedAt: new Date(),
        actionNote: note || null
      }
    },
    { new: true }
  );
  if (!updated) throw new Error('This leave request has already been actioned by another manager');

  if (newStatus === LeaveRequestStatus.REJECTED) {
    const allocation = await LeaveAllocation.findOne({
      employeeId: request.appliedFor,
      leaveTypeId: request.leaveTypeId,
      year: toDateOnly(request.fromDate).getUTCFullYear()
    });
    if (allocation) {
      allocation.pending = Math.max(0, Number((allocation.pending - request.durationDays).toFixed(2)));
      await allocation.save();
    }
  }

  if (newStatus === LeaveRequestStatus.APPROVED) {
    const allocation = await LeaveAllocation.findOne({
      employeeId: request.appliedFor,
      leaveTypeId: request.leaveTypeId,
      year: toDateOnly(request.fromDate).getUTCFullYear()
    });
    if (allocation) {
      allocation.pending = Math.max(0, Number((allocation.pending - request.durationDays).toFixed(2)));
      allocation.used = Number((allocation.used + request.durationDays).toFixed(2));
      await allocation.save();
    }
  }

  await writeAudit(connection, {
    leaveRequestId: updated._id,
    action: newStatus === LeaveRequestStatus.APPROVED ? LeaveAuditAction.APPROVED : LeaveAuditAction.REJECTED,
    performedBy: actor._id,
    note: note || '',
    previousStatus: LeaveRequestStatus.PENDING,
    newStatus
  });

  await syncLeaveRequestToTimesheets(connection, updated._id);

  return updated;
}

async function withdrawLeaveRequest(connection, actor, requestId) {
  const { LeaveRequest, LeaveAllocation } = getLeaveModels(connection);
  const request = await LeaveRequest.findById(requestId);
  if (!request) throw new Error('Leave request not found');
  if (String(request.appliedFor) !== String(actor._id)) throw new Error('Not allowed');
  if (request.status !== LeaveRequestStatus.PENDING) throw new Error('Only pending request can be withdrawn');

  request.status = LeaveRequestStatus.WITHDRAWN;
  request.actionedBy = actor._id;
  request.actionedAt = new Date();
  await request.save();

  const allocation = await LeaveAllocation.findOne({
    employeeId: request.appliedFor,
    leaveTypeId: request.leaveTypeId,
    year: toDateOnly(request.fromDate).getUTCFullYear()
  });
  if (allocation) {
    allocation.pending = Math.max(0, Number((allocation.pending - request.durationDays).toFixed(2)));
    await allocation.save();
  }

  await writeAudit(connection, {
    leaveRequestId: request._id,
    action: LeaveAuditAction.WITHDRAWN,
    performedBy: actor._id,
    note: 'Employee withdrew request',
    previousStatus: LeaveRequestStatus.PENDING,
    newStatus: LeaveRequestStatus.WITHDRAWN
  });
}

async function adminOverrideLeave(connection, actor, requestId, status, note) {
  if (!isAdmin(actor.role)) throw new Error('Admin access required');
  if (!note) throw new Error('Override note is mandatory');
  const { LeaveRequest } = getLeaveModels(connection);
  const request = await LeaveRequest.findById(requestId);
  if (!request) throw new Error('Leave request not found');
  const prevStatus = request.status;
  request.status = status;
  request.actionedBy = actor._id;
  request.actionedAt = new Date();
  request.actionNote = note;
  await request.save();

  await writeAudit(connection, {
    leaveRequestId: request._id,
    action: LeaveAuditAction.OVERRIDDEN,
    performedBy: actor._id,
    note,
    previousStatus: prevStatus,
    newStatus: status
  });

  await syncLeaveRequestToTimesheets(connection, request._id);
}

async function runLeaveEscalationJob(connection) {
  const { LeaveRequest } = getLeaveModels(connection);
  const User = await getTenantUserModel(connection);
  const now = new Date();
  const stale = await LeaveRequest.find({
    status: LeaveRequestStatus.PENDING,
    escalatedToAdmin: false,
    escalationDeadlineAt: { $lte: now }
  });
  if (stale.length === 0) return 0;

  const admins = await User.find({ role: { $in: ['admin', 'company_admin'] }, isActive: true }).select('_id');
  let escalatedCount = 0;
  for (const request of stale) {
    request.escalatedToAdmin = true;
    request.escalatedAt = now;
    await request.save();
    escalatedCount += 1;

    await writeAudit(connection, {
      leaveRequestId: request._id,
      action: LeaveAuditAction.ESCALATED,
      performedBy: request.appliedBy,
      note: 'Auto-escalated due to SLA breach',
      previousStatus: LeaveRequestStatus.PENDING,
      newStatus: LeaveRequestStatus.PENDING
    });

    await Promise.all(
      admins.map((admin) =>
        createNotification(connection, {
          recipient: admin._id,
          type: 'leave-request',
          title: 'Escalated leave request',
          message: 'A leave request was escalated due to manager inaction',
          relatedEntity: { entityType: 'LeaveRequestV2', entityId: request._id }
        })
      )
    );
  }
  return escalatedCount;
}

module.exports = {
  submitLeaveRequest,
  actionLeaveRequest,
  withdrawLeaveRequest,
  adminOverrideLeave,
  runLeaveEscalationJob
};
