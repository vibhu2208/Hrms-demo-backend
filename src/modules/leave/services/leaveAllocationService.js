const mongoose = require('mongoose');
const { getLeaveModels } = require('../models/leaveModels');
const { LeaveAllocationType } = require('../types/leave.types');

const HRMS_ALLOCATABLE_ROLES = ['employee', 'hr', 'manager'];
const ALLOCATION_TYPE_SET = new Set(Object.values(LeaveAllocationType));

async function getUserModel(connection) {
  const schema = require('../../../models/tenant/TenantUser');
  return connection.models.User || connection.model('User', schema);
}

async function assertLeaveTypeActive(connection, leaveTypeId) {
  const { LeaveType } = getLeaveModels(connection);
  const lt = await LeaveType.findById(leaveTypeId).lean();
  if (!lt) throw new Error('Leave type not found');
  if (lt.isArchived) throw new Error('Cannot allocate to an archived leave type');
  return lt;
}

/**
 * Resolve tenant User ids eligible for leave allocation.
 * @param {import('mongoose').Connection} connection
 * @param {string} allocationType
 * @param {object} body
 * @returns {Promise<string[]>}
 */
async function resolveTargetUserIds(connection, allocationType, body) {
  const User = await getUserModel(connection);
  const baseFilter = { isActive: true, role: { $in: HRMS_ALLOCATABLE_ROLES } };

  switch (allocationType) {
    case LeaveAllocationType.COMPANY_WIDE: {
      const rows = await User.find(baseFilter).select('_id').lean();
      return rows.map((r) => String(r._id));
    }
    /** HRMS: targets tenant User.role (manager, hr, employee) — not job title */
    case LeaveAllocationType.DESIGNATION_WISE: {
      const roles = (body.roles || [])
        .map((r) => String(r).toLowerCase().trim())
        .filter((r) => HRMS_ALLOCATABLE_ROLES.includes(r));
      if (!roles.length) {
        throw new Error('Select at least one role: Manager, HR, or Employee');
      }
      const rows = await User.find({
        isActive: true,
        role: { $in: roles }
      })
        .select('_id role')
        .lean();
      return [...new Set(rows.map((r) => String(r._id)))];
    }
    case LeaveAllocationType.EMPLOYEE_SPECIFIC: {
      const rawIds = [body.employeeId, ...(body.employeeIds || [])].filter(Boolean);
      if (!rawIds.length) throw new Error('Select at least one employee');
      const out = [];
      for (const id of rawIds) {
        if (!mongoose.Types.ObjectId.isValid(id)) continue;
        const u = await User.findById(id).select('_id isActive role').lean();
        if (!u) throw new Error(`User not found: ${id}`);
        if (!u.isActive) throw new Error('Cannot allocate to an inactive employee');
        if (!HRMS_ALLOCATABLE_ROLES.includes(u.role)) {
          throw new Error('Selected user is not eligible for standard leave allocation');
        }
        out.push(String(u._id));
      }
      return [...new Set(out)];
    }
    default:
      throw new Error('Invalid allocation type for employee resolution');
  }
}

function buildTargetingPatch(allocationType, body) {
  if (allocationType === LeaveAllocationType.COMPANY_WIDE) return null;
  const patch = {};
  if (allocationType === LeaveAllocationType.DESIGNATION_WISE && body.roles?.length) {
    patch.roles = body.roles
      .map((r) => String(r).toLowerCase().trim())
      .filter((r) => HRMS_ALLOCATABLE_ROLES.includes(r));
  }
  if (Object.keys(patch).length === 0) return null;
  return patch;
}

async function upsertSetAllocations(connection, actorId, params) {
  const {
    employeeObjectIds,
    leaveTypeId,
    year,
    days,
    allocationType,
    allocationBatchId,
    targetingPatch,
    conflictPolicy
  } = params;
  const { LeaveAllocation } = getLeaveModels(connection);
  const ltId = new mongoose.Types.ObjectId(leaveTypeId);
  const y = Number(year);
  const updates = [];
  const skipped = [];

  const $set = {
    totalAllocated: Number(days),
    allocationType,
    allocationBatchId
  };
  if (targetingPatch) {
    $set.allocationTargeting = targetingPatch;
  }

  for (const employeeId of employeeObjectIds) {
    if (conflictPolicy === 'skip') {
      const exists = await LeaveAllocation.findOne({ employeeId, leaveTypeId: ltId, year: y }).select('_id').lean();
      if (exists) {
        skipped.push(String(employeeId));
        continue;
      }
    }

    const update = {
      $set,
      $setOnInsert: {
        employeeId,
        leaveTypeId: ltId,
        year: y,
        createdBy: actorId,
        used: 0,
        pending: 0
      }
    };
    if (!targetingPatch) {
      update.$unset = { allocationTargeting: '' };
    }

    const doc = await LeaveAllocation.findOneAndUpdate(
      { employeeId, leaveTypeId: ltId, year: y },
      update,
      { upsert: true, new: true, runValidators: true }
    );
    updates.push(doc);
  }

  return { updates, skipped };
}

async function manualAdjust(connection, actorId, body) {
  const { leaveTypeId, year, adjustmentDelta, adjustmentReason } = body;
  const eid = body.employeeId || (Array.isArray(body.employeeIds) && body.employeeIds.length === 1 ? body.employeeIds[0] : null);
  if (!eid) throw new Error('Select exactly one employee for manual adjustment');
  if (Array.isArray(body.employeeIds) && body.employeeIds.length > 1 && !body.employeeId) {
    throw new Error('Manual adjustment applies to one employee at a time');
  }
  if (!adjustmentReason || !String(adjustmentReason).trim()) {
    throw new Error('Reason is required for manual adjustment');
  }
  const userIds = await resolveTargetUserIds(connection, LeaveAllocationType.EMPLOYEE_SPECIFIC, {
    employeeId: eid
  });
  const employeeObjectId = new mongoose.Types.ObjectId(userIds[0]);
  const ltId = new mongoose.Types.ObjectId(leaveTypeId);
  const y = Number(year);
  const delta = Number(adjustmentDelta);
  if (!Number.isFinite(delta)) throw new Error('Invalid adjustment amount');

  const { LeaveAllocation } = getLeaveModels(connection);
  let alloc = await LeaveAllocation.findOne({
    employeeId: employeeObjectId,
    leaveTypeId: ltId,
    year: y
  });

  if (!alloc) {
    if (delta < 0) throw new Error('Cannot deduct: no existing allocation for this employee, year, and leave type');
    const nextTotal = Number(Math.max(0, delta).toFixed(2));
    alloc = await LeaveAllocation.create({
      employeeId: employeeObjectId,
      leaveTypeId: ltId,
      year: y,
      totalAllocated: nextTotal,
      used: 0,
      pending: 0,
      createdBy: actorId,
      allocationType: LeaveAllocationType.MANUAL_ADJUSTMENT,
      overrideNote: String(adjustmentReason).trim()
    });
    return { updates: [alloc], skipped: [], manualCreated: true };
  }

  const next = Number((alloc.totalAllocated + delta).toFixed(2));
  if (next < 0) throw new Error('Adjustment would result in negative total allocation');
  alloc.totalAllocated = next;
  alloc.allocationType = LeaveAllocationType.MANUAL_ADJUSTMENT;
  alloc.overrideNote = String(adjustmentReason).trim();
  await alloc.save();
  return { updates: [alloc], skipped: [], manualCreated: false };
}

/**
 * @param {import('mongoose').Connection} connection
 * @param {{ _id: import('mongoose').Types.ObjectId }} actor
 * @param {object} body
 */
async function processLeaveAllocationRequest(connection, actor, body) {
  const payload = { ...body };
  if (!payload.allocationType) {
    if (payload.employeeIds?.length || payload.employeeId) {
      payload.allocationType = LeaveAllocationType.EMPLOYEE_SPECIFIC;
    } else {
      throw new Error('allocationType is required');
    }
  }

  const allocationType = payload.allocationType;
  if (!ALLOCATION_TYPE_SET.has(allocationType)) {
    throw new Error('Invalid allocation type');
  }

  const { leaveTypeId, year } = payload;
  if (!leaveTypeId) throw new Error('Leave type is required');
  if (year == null || Number.isNaN(Number(year))) throw new Error('Year is required');

  await assertLeaveTypeActive(connection, leaveTypeId);

  if (allocationType === LeaveAllocationType.MANUAL_ADJUSTMENT) {
    return manualAdjust(connection, actor._id, payload);
  }

  const days = Number(payload.days);
  if (!Number.isFinite(days) || days < 0) {
    throw new Error('Allocated days must be a non-negative number');
  }

  const userIdStrings = await resolveTargetUserIds(connection, allocationType, payload);
  if (!userIdStrings.length) {
    throw new Error('No eligible active employees matched the selection');
  }

  const allocationBatchId = new mongoose.Types.ObjectId();
  const targetingPatch = buildTargetingPatch(allocationType, payload);
  const conflictPolicy = payload.conflictPolicy === 'skip' ? 'skip' : 'overwrite';

  const employeeObjectIds = userIdStrings.map((id) => new mongoose.Types.ObjectId(id));
  const { updates, skipped } = await upsertSetAllocations(connection, actor._id, {
    employeeObjectIds,
    leaveTypeId,
    year,
    days,
    allocationType,
    allocationBatchId,
    targetingPatch,
    conflictPolicy
  });

  return {
    updates,
    skipped,
    summary: {
      affected: updates.length,
      skippedCount: skipped.length,
      allocationBatchId: String(allocationBatchId),
      allocationType
    }
  };
}

module.exports = {
  processLeaveAllocationRequest,
  resolveTargetUserIds,
  assertLeaveTypeActive,
  LeaveAllocationType
};
