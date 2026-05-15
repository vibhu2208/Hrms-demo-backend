const mongoose = require('mongoose');
const { getTimesheetModels } = require('../models/timesheetModels');
const {
  ensureWeekTimesheet,
  submitTimesheet,
  approveProjectSlice,
  lockTimesheet,
  autofillLeaveAndHolidays,
  startOfWeek,
  fetchFullDayApprovedLeaveDateKeys
} = require('../services/sliceApprovalEngine');
const { parseCalendarDate } = require('../services/timesheetPeriod');
const { parseCsv, validateParsedRows } = require('../services/bulkUploadParser');
const {
  TimesheetEntrySource,
  TimesheetEntryType,
  TimesheetOverallStatus,
  SliceStatus
} = require('../types/timesheet.types');

function ensureTenant(req) {
  if (!req.tenant?.connection) throw new Error('Tenant connection unavailable');
  return req.tenant.connection;
}

function isAdmin(role) {
  return role === 'admin' || role === 'company_admin';
}

function canActForOthers(role) {
  return role === 'manager' || isAdmin(role);
}

/** Calendar YYYY-MM-DD for a stored entryDate (matches frontend week columns). */
function entryCalendarDayKey(entryDate) {
  if (!entryDate) return '';
  if (typeof entryDate === 'string') {
    const m = entryDate.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = parseCalendarDate(entryDate);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function normalizeRefId(value, depth = 0, visited = null) {
  if (value == null || depth > 5) return null;

  if (typeof value === 'string') {
    const s = value.trim();
    return s || null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (typeof value === 'object') {
    const tracker = visited || new WeakSet();
    if (tracker.has(value)) return null;
    tracker.add(value);

    if (typeof value.toHexString === 'function') {
      const hex = value.toHexString();
      return /^[a-fA-F0-9]{24}$/.test(hex) ? hex : null;
    }

    const nested = value._id;
    if (nested != null && nested !== value) {
      return normalizeRefId(nested, depth + 1, tracker);
    }

    return null;
  }

  const s = String(value).trim();
  if (!s || s === '[object Object]') return null;
  return s;
}

function isStrictObjectId(value) {
  const s = normalizeRefId(value);
  if (!s || !/^[a-fA-F0-9]{24}$/.test(s)) return false;
  try {
    return String(new mongoose.Types.ObjectId(s)) === s;
  } catch {
    return false;
  }
}

function toObjectId(value) {
  const s = normalizeRefId(value);
  if (!s || !isStrictObjectId(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

function toObjectIdList(values) {
  const out = [];
  const seen = new Set();
  for (const v of values || []) {
    const s = normalizeRefId(v);
    if (!s || !/^[a-fA-F0-9]{24}$/.test(s) || seen.has(s)) continue;
    try {
      if (String(new mongoose.Types.ObjectId(s)) !== s) continue;
    } catch {
      continue;
    }
    seen.add(s);
    out.push(new mongoose.Types.ObjectId(s));
  }
  return out;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfWeekMonday(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isWeekdayDate(d) {
  const day = d.getUTCDay();
  return day !== 0 && day !== 6;
}

function eachCalendarDayKey(periodStart, periodEnd) {
  const keys = [];
  const start = parseCalendarDate(periodStart);
  const end = parseCalendarDate(periodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return keys;
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cur <= endUtc) {
    keys.push(entryCalendarDayKey(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return keys.filter(Boolean);
}

function computeTimesheetEntrySummary(entries, periodStart, periodEnd) {
  const daysWithEntry = new Set();
  const workHoursByDay = new Map();
  let totalWorkedHours = 0;
  let totalPayableHours = 0;
  let leaveDayCount = 0;
  let sentBackCount = 0;
  const projectNameSet = new Set();

  for (const e of entries || []) {
    const key = entryCalendarDayKey(e.entryDate);
    if (key) daysWithEntry.add(key);
    if (e.projectName) projectNameSet.add(e.projectName);

    if (e.sliceStatus === SliceStatus.SENT_BACK) sentBackCount += 1;

    const type = e.entryType || TimesheetEntryType.WORK;
    if (type === TimesheetEntryType.LEAVE) {
      leaveDayCount += 1;
      continue;
    }
    if (
      type !== TimesheetEntryType.WORK &&
      type !== TimesheetEntryType.TRAINING &&
      type !== TimesheetEntryType.INTERNAL
    ) {
      continue;
    }

    const worked = Number(e.workedHours != null ? e.workedHours : e.hours ?? 0);
    const payable = Number(e.payableHours != null ? e.payableHours : worked);
    totalWorkedHours += worked;
    totalPayableHours += payable;
    if (key) {
      workHoursByDay.set(key, (workHoursByDay.get(key) || 0) + worked);
    }
  }

  let overtimeHours = 0;
  workHoursByDay.forEach((h) => {
    if (h > 8) overtimeHours += h - 8;
  });

  const weekdayKeys = eachCalendarDayKey(periodStart, periodEnd).filter((k) => {
    const [y, m, d] = k.split('-').map(Number);
    return isWeekdayDate(new Date(Date.UTC(y, m - 1, d)));
  });
  const missingEntryDays = weekdayKeys.filter((k) => !daysWithEntry.has(k)).length;

  return {
    totalWorkedHours: Number(totalWorkedHours.toFixed(2)),
    totalPayableHours: Number(totalPayableHours.toFixed(2)),
    leaveDays: leaveDayCount,
    missingEntryDays,
    overtimeHours: Number(overtimeHours.toFixed(2)),
    sentBackCount,
    projectNames: [...projectNameSet].slice(0, 4)
  };
}

async function buildQueueSummaries(connection, timesheetIds) {
  const map = new Map();
  if (!timesheetIds.length) return map;
  const { TimesheetEntry } = getTimesheetModels(connection);
  const objectIds = toObjectIdList(timesheetIds);
  if (!objectIds.length) return map;

  const Project = await getTenantProjectModel(connection);
  const agg = await TimesheetEntry.aggregate([
    { $match: { timesheetId: { $in: objectIds } } },
    {
      $group: {
        _id: '$timesheetId',
        totalWorked: { $sum: { $ifNull: ['$workedHours', '$hours'] } },
        totalPayable: { $sum: { $ifNull: ['$payableHours', '$hours'] } },
        leaveEntries: { $sum: { $cond: [{ $eq: ['$entryType', TimesheetEntryType.LEAVE] }, 1, 0] } },
        sentBackSlices: { $sum: { $cond: [{ $eq: ['$sliceStatus', SliceStatus.SENT_BACK] }, 1, 0] } },
        projectIds: { $addToSet: '$projectId' }
      }
    }
  ]);

  const allProjectIds = toObjectIdList(agg.flatMap((row) => row.projectIds || []));
  const projects = allProjectIds.length
    ? await Project.find({
        _id: { $in: allProjectIds }
      })
        .select('_id name projectCode')
        .lean()
    : [];
  const projectMap = new Map(projects.map((p) => [String(p._id), p.name || p.projectCode || 'Project']));

  agg.forEach((row) => {
    const names = (row.projectIds || [])
      .map((id) => projectMap.get(String(id)))
      .filter(Boolean);
    map.set(String(row._id), {
      totalWorkedHours: Number((row.totalWorked || 0).toFixed(2)),
      totalPayableHours: Number((row.totalPayable || 0).toFixed(2)),
      leaveDays: row.leaveEntries || 0,
      sentBackCount: row.sentBackSlices || 0,
      hasSentBack: (row.sentBackSlices || 0) > 0,
      projectNames: [...new Set(names)].slice(0, 4)
    });
  });
  return map;
}

async function filterRowsForManager(connection, managerId, rows) {
  const checks = await Promise.all(
    rows.map(async (row) => {
      if (!row.employeeId) return { row, ok: false };
      const ok = await managerCanEditEmployeeTimesheet(connection, managerId, row.employeeId);
      return { row, ok };
    })
  );
  return checks.filter((c) => c.ok).map((c) => c.row);
}

async function sentBackCorrectionDayKeys(connection, timesheetId) {
  const { TimesheetEntry } = getTimesheetModels(connection);
  const rows = await TimesheetEntry.find({
    timesheetId,
    sliceStatus: SliceStatus.SENT_BACK,
    isEditable: { $ne: false },
    entryType: { $in: [TimesheetEntryType.WORK, TimesheetEntryType.TRAINING, TimesheetEntryType.INTERNAL] }
  }).select('entryDate');
  const keys = new Set();
  rows.forEach((r) => {
    const k = entryCalendarDayKey(r.entryDate);
    if (k) keys.add(k);
  });
  return keys;
}

async function getTenantUserModel(connection) {
  const schema = require('../../../models/tenant/TenantUser');
  return connection.models.User || connection.model('User', schema);
}

async function getTenantProjectModel(connection) {
  const schema = require('../../../models/tenant/Project');
  return connection.models.Project || connection.model('Project', schema);
}

async function getProjectAssignmentModel(connection) {
  return (
    connection.models.ProjectAssignment ||
    connection.model('ProjectAssignment', new mongoose.Schema({}, { strict: false }), 'projectassignments')
  );
}

async function managerCanEditEmployeeTimesheet(connection, managerId, employeeId) {
  const managerIdStr = String(managerId);
  const employeeIdStr = String(employeeId);
  if (managerIdStr === employeeIdStr) {
    return true;
  }

  const Project = await getTenantProjectModel(connection);
  const ProjectAssignment = await getProjectAssignmentModel(connection);

  // Projects managed by this manager from assignments + project document fields.
  const managerAssignments = await ProjectAssignment.find({
    userId: { $in: [managerId, managerIdStr] },
    role: 'manager',
    isActive: { $ne: false }
  }).select('projectId');
  const managedProjectIdSet = new Set(
    managerAssignments.map((a) => normalizeRefId(a.projectId)).filter(Boolean)
  );

  const managedProjectDocs = await Project.find({
    $or: [
      { projectManager: managerId },
      { assignedManagers: { $in: [managerIdStr, managerId] } }
    ]
  }).select('_id');
  managedProjectDocs.forEach((p) => managedProjectIdSet.add(String(p._id)));

  if (!managedProjectIdSet.size) {
    return false;
  }

  const managedProjectIds = toObjectIdList([...managedProjectIdSet]);
  if (!managedProjectIds.length) {
    return false;
  }

  // Employee is editable if they are assigned/member/hr in any managed project.
  const employeeAssignment = await ProjectAssignment.findOne({
    projectId: { $in: managedProjectIds },
    userId: { $in: [employeeId, employeeIdStr] },
    isActive: { $ne: false }
  }).select('_id');
  if (employeeAssignment) {
    return true;
  }

  const employeeInManagedProject = await Project.findOne({
    _id: { $in: managedProjectIds },
    $or: [
      { 'teamMembers.employee': employeeId },
      { assignedHRs: { $in: [employeeIdStr, employeeId] } },
      { projectManager: employeeId }
    ]
  }).select('_id');
  return Boolean(employeeInManagedProject);
}

exports.getWeekTimesheet = async (req, res) => {
  try {
    const connection = ensureTenant(req);
    const { Timesheet, TimesheetEntry } = getTimesheetModels(connection);
    let ts;
    if (req.query.timesheetId) {
      ts = await Timesheet.findById(req.query.timesheetId);
      if (!ts) return res.status(404).json({ success: false, message: 'Timesheet not found' });
    } else {
      const week = parseCalendarDate(req.query.week || undefined);
      const requestedEmployeeId = req.query.employeeId || req.user._id;
      if (String(requestedEmployeeId) !== String(req.user._id) && !canActForOthers(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Not allowed to access another user timesheet' });
      }
      if (req.user.role === 'manager' && String(requestedEmployeeId) !== String(req.user._id)) {
        const allowed = await managerCanEditEmployeeTimesheet(connection, req.user._id, requestedEmployeeId);
        if (!allowed) {
          return res.status(403).json({ success: false, message: 'Manager can access timesheets only for their team members' });
        }
      }
      const employeeId = requestedEmployeeId;
      ts = await ensureWeekTimesheet(connection, employeeId, week);
      await autofillLeaveAndHolidays(connection, employeeId, week);
    }
    const entries = await TimesheetEntry.find({
      timesheetId: ts._id,
      entryDate: { $gte: ts.periodStart, $lte: ts.periodEnd }
    })
      .sort({ entryDate: 1, createdAt: 1 })
      .populate('leaveTypeId', 'name isPaid');
    res.json({ success: true, data: { timesheet: ts, entries } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.upsertEntries = async (req, res) => {
  try {
    const connection = ensureTenant(req);
    const requestedEmployeeId = req.body.employeeId || req.user._id;
    if (String(requestedEmployeeId) !== String(req.user._id) && !canActForOthers(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only manager/admin can fill timesheet for others' });
    }
    if (req.user.role === 'manager' && String(requestedEmployeeId) !== String(req.user._id)) {
      const allowed = await managerCanEditEmployeeTimesheet(connection, req.user._id, requestedEmployeeId);
      if (!allowed) {
        return res.status(403).json({ success: false, message: 'Manager can fill timesheets only for their team members' });
      }
    }
    const employeeId = requestedEmployeeId;
    const week = parseCalendarDate(req.body.week || undefined);
    const ts = await ensureWeekTimesheet(connection, employeeId, week);
    const { TimesheetEntry } = getTimesheetModels(connection);
    const rows = req.body.entries || [];

    const overall = ts.overallStatus || TimesheetOverallStatus.DRAFT;
    if (overall === TimesheetOverallStatus.LOCKED || overall === TimesheetOverallStatus.FULLY_APPROVED) {
      throw new Error('This timesheet is finalized and cannot be edited.');
    }
    if (overall === TimesheetOverallStatus.SUBMITTED) {
      throw new Error(
        'This timesheet is submitted for approval. You can edit again only after a manager returns it for corrections.'
      );
    }
    let correctionDayKeys = null;
    if (overall === TimesheetOverallStatus.PARTIALLY_APPROVED) {
      correctionDayKeys = await sentBackCorrectionDayKeys(connection, ts._id);
      if (!correctionDayKeys.size) {
        throw new Error(
          'This timesheet cannot be edited until a manager returns a day for corrections.'
        );
      }
    }

    const fullDayLeaveIsoDays = await fetchFullDayApprovedLeaveDateKeys(
      connection,
      employeeId,
      ts.periodStart,
      ts.periodEnd
    );
    for (const row of rows) {
      const et = row.entryType || TimesheetEntryType.WORK;
      if (et !== TimesheetEntryType.WORK) continue;
      const wh = Number(row.workedHours != null ? row.workedHours : row.hours);
      if (wh <= 0) continue;
      const dayKey = new Date(row.entryDate).toISOString().slice(0, 10);
      if (fullDayLeaveIsoDays.has(dayKey)) {
        throw new Error(`Project time is not allowed on ${dayKey} (approved full-day leave).`);
      }
    }

    for (const row of rows) {
      const rowDayKey = entryCalendarDayKey(row.entryDate);
      if (correctionDayKeys && rowDayKey && !correctionDayKeys.has(rowDayKey)) {
        continue;
      }

      if (row.id) {
        const existing = await TimesheetEntry.findById(row.id);
        if (!existing) continue;
        if (!existing.isEditable) continue;
        if (correctionDayKeys) {
          const existingDay = entryCalendarDayKey(existing.entryDate);
          if (!correctionDayKeys.has(existingDay) || existing.sliceStatus !== SliceStatus.SENT_BACK) {
            continue;
          }
        }
        const wh = Number(row.workedHours != null ? row.workedHours : row.hours);
        const ph = Number(row.payableHours != null ? row.payableHours : wh);
        Object.assign(existing, {
          entryDate: row.entryDate,
          projectId: row.projectId || null,
          taskDescription: row.taskDescription || '',
          hours: wh,
          workedHours: wh,
          payableHours: ph,
          entryType: row.entryType || existing.entryType,
          isBillable: Boolean(row.isBillable),
          filledBy: req.user._id
        });
        await existing.save();
      } else {
        const wh = Number(row.workedHours != null ? row.workedHours : row.hours);
        const ph = Number(row.payableHours != null ? row.payableHours : wh);
        if (correctionDayKeys && (!rowDayKey || !correctionDayKeys.has(rowDayKey))) {
          continue;
        }
        await TimesheetEntry.create({
          timesheetId: ts._id,
          entryDate: row.entryDate,
          projectId: row.projectId || null,
          taskDescription: row.taskDescription || '',
          hours: wh,
          workedHours: wh,
          payableHours: ph,
          entryType: row.entryType || TimesheetEntryType.WORK,
          isBillable: row.isBillable !== false,
          filledBy: req.user._id,
          source: TimesheetEntrySource.MANUAL,
          sliceStatus: correctionDayKeys ? SliceStatus.SENT_BACK : SliceStatus.DRAFT,
          isEditable: true
        });
      }
    }
    const entries = await TimesheetEntry.find({ timesheetId: ts._id })
      .sort({ entryDate: 1 })
      .populate('leaveTypeId', 'name isPaid');
    res.json({ success: true, data: { timesheet: ts, entries } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.submitWeek = async (req, res) => {
  try {
    const connection = ensureTenant(req);
    const result = await submitTimesheet(connection, req.user, req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message, warnings: error.warnings || [] });
  }
};

exports.managerQueue = async (req, res) => {
  try {
    const connection = ensureTenant(req);
    const { Timesheet } = getTimesheetModels(connection);
    const User = await getTenantUserModel(connection);
    const currentUser = await User.findById(req.user._id).select('_id role');
    if (!currentUser || !['manager', 'admin', 'company_admin'].includes(currentUser.role)) {
      return res.status(403).json({ success: false, message: 'Manager/Admin only' });
    }

    const isManagerRole = currentUser.role === 'manager';
    const statusParam = String(req.query.status || 'pending').toLowerCase();
    const statusBuckets = {
      pending: ['submitted', 'partially_approved'],
      submitted: ['submitted'],
      partially_approved: ['partially_approved'],
      fully_approved: ['fully_approved'],
      all: ['submitted', 'partially_approved', 'fully_approved']
    };
    const statusFilter = statusBuckets[statusParam] || statusBuckets.pending;

    const v2Raw = await Timesheet.find({ overallStatus: { $in: statusFilter } })
      .sort({ submittedAt: -1, periodStart: -1 })
      .lean();

    const v2EmployeeIds = toObjectIdList(v2Raw.map((row) => row.employeeId));
    const v2Users = v2EmployeeIds.length
      ? await User.find({ _id: { $in: v2EmployeeIds } })
          .select('_id firstName lastName email role')
          .lean()
      : [];
    const v2UserMap = new Map(v2Users.map((u) => [String(u._id), u]));

    let v2 = v2Raw.map((row) => {
      const u = v2UserMap.get(String(row.employeeId || ''));
      return {
        _id: row._id,
        employeeId: normalizeRefId(row.employeeId) || row.employeeId,
        employeeName: u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email : 'Unknown User',
        employeeRole: u?.role || null,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        overallStatus: row.overallStatus,
        submittedAt: row.submittedAt || row.updatedAt || row.createdAt,
        source: 'v2',
        legacy: false
      };
    });

    const LegacyTimesheet =
      connection.models.Timesheet || connection.model('Timesheet', new mongoose.Schema({}, { strict: false }), 'timesheets');
    const legacyStatusMap = {
      pending: ['submitted'],
      submitted: ['submitted'],
      partially_approved: [],
      fully_approved: ['approved'],
      all: ['submitted', 'approved', 'rejected']
    };
    const legacyStatuses = legacyStatusMap[statusParam] || legacyStatusMap.pending;
    const legacy =
      legacyStatuses.length > 0
        ? await LegacyTimesheet.find({ status: { $in: legacyStatuses } })
            .sort({ weekStartDate: -1 })
            .limit(100)
            .lean()
        : [];

    const legacyEmployeeIds = toObjectIdList(legacy.map((row) => row.employee || row.employeeId));
    const legacyUsers = legacyEmployeeIds.length
      ? await User.find({ _id: { $in: legacyEmployeeIds } })
          .select('_id firstName lastName email role')
          .lean()
      : [];
    const legacyUserMap = new Map(legacyUsers.map((u) => [String(u._id), u]));

    let legacyMapped = legacy.map((row) => {
      const employeeId = normalizeRefId(row.employee || row.employeeId) || null;
      const u = legacyUserMap.get(String(employeeId || ''));
      return {
        _id: row._id,
        employeeId,
        employeeName: u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email : 'Unknown User',
        employeeRole: u?.role || null,
        periodStart: row.weekStartDate || row.periodStart || row.createdAt,
        periodEnd: row.weekEndDate || row.periodEnd || row.createdAt,
        overallStatus: row.status || 'submitted',
        submittedAt: row.submittedAt || row.updatedAt || row.createdAt,
        source: 'legacy',
        legacy: true
      };
    });

    if (isManagerRole) {
      v2 = v2.filter((row) => String(row.employeeId || '') !== String(currentUser._id));
      legacyMapped = legacyMapped.filter((row) => String(row.employeeId || '') !== String(currentUser._id));
      v2 = await filterRowsForManager(connection, currentUser._id, v2);
      legacyMapped = await filterRowsForManager(connection, currentUser._id, legacyMapped);
    }

    const summaryMap = await buildQueueSummaries(
      connection,
      v2.map((r) => r._id)
    );
    v2 = v2.map((row) => ({
      ...row,
      summary: summaryMap.get(String(row._id)) || {
        totalWorkedHours: 0,
        totalPayableHours: 0,
        leaveDays: 0,
        sentBackCount: 0,
        hasSentBack: false,
        projectNames: []
      }
    }));

    const { q, fromDate, toDate, sort } = req.query;
    let combined = [...v2, ...legacyMapped];

    if (q && String(q).trim()) {
      const needle = String(q).trim().toLowerCase();
      combined = combined.filter((row) => (row.employeeName || '').toLowerCase().includes(needle));
    }
    if (fromDate) {
      const fd = startOfDay(new Date(fromDate));
      if (!Number.isNaN(fd.getTime())) {
        combined = combined.filter((row) => new Date(row.periodEnd) >= fd);
      }
    }
    if (toDate) {
      const td = endOfDay(new Date(toDate));
      if (!Number.isNaN(td.getTime())) {
        combined = combined.filter((row) => new Date(row.periodStart) <= td);
      }
    }

    const sortKey = String(sort || 'submitted_desc');
    combined.sort((a, b) => {
      if (sortKey === 'employee_asc') {
        return (a.employeeName || '').localeCompare(b.employeeName || '');
      }
      if (sortKey === 'period_asc') {
        return new Date(a.periodStart) - new Date(b.periodStart);
      }
      if (sortKey === 'period_desc') {
        return new Date(b.periodStart) - new Date(a.periodStart);
      }
      const sa = new Date(a.submittedAt || a.periodStart).getTime();
      const sb = new Date(b.submittedAt || b.periodStart).getTime();
      return sb - sa;
    });

    const pendingCount = combined.filter((r) =>
      ['submitted', 'partially_approved'].includes(String(r.overallStatus || '').toLowerCase())
    ).length;
    const sentBackCount = combined.filter((r) => r.summary?.hasSentBack || r.summary?.sentBackCount > 0).length;

    const weekStart = startOfWeekMonday(new Date());
    const teamEmployeeIds = toObjectIdList(combined.map((r) => r.employeeId));
    const approvedScope =
      isManagerRole && teamEmployeeIds.length ? { employeeId: { $in: teamEmployeeIds } } : {};
    const approvedThisWeek = await Timesheet.countDocuments({
      ...approvedScope,
      overallStatus: TimesheetOverallStatus.FULLY_APPROVED,
      updatedAt: { $gte: weekStart }
    });

    const draftScope =
      isManagerRole && teamEmployeeIds.length ? { employeeId: { $in: teamEmployeeIds } } : {};
    const draftPendingSubmission = await Timesheet.countDocuments({
      ...draftScope,
      overallStatus: TimesheetOverallStatus.DRAFT,
      periodStart: { $gte: weekStart }
    });

    res.json({
      success: true,
      data: combined,
      meta: {
        pendingCount,
        approvedThisWeek,
        sentBackCount,
        draftPendingSubmission,
        totalCount: combined.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.sliceAction = async (req, res) => {
  try {
    const connection = ensureTenant(req);
    const { Timesheet } = getTimesheetModels(connection);
    const ts = await Timesheet.findById(req.params.id).select('_id employeeId');
    if (!ts) return res.status(404).json({ success: false, message: 'Timesheet not found' });
    if (req.user.role === 'manager' && String(ts.employeeId) === String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Manager self-timesheet can only be approved/actioned by admin' });
    }
    const data = await approveProjectSlice(
      connection,
      req.user,
      req.params.id,
      req.body.projectId || null,
      req.body.sendBackReason || null
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getTimesheetDetail = async (req, res) => {
  try {
    const connection = ensureTenant(req);
    const { Timesheet, TimesheetEntry } = getTimesheetModels(connection);
    const ProjectSchema = require('../../../models/tenant/Project');
    const Project = connection.models.Project || connection.model('Project', ProjectSchema);
    const User = await getTenantUserModel(connection);
    const timesheet = await Timesheet.findById(req.params.id);
    if (!timesheet) {
      return res.status(404).json({ success: false, message: 'Timesheet not found' });
    }
    const user = await User.findById(timesheet.employeeId).select('firstName lastName email').lean();
    const employeeName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Unknown User';
    const entriesRaw = await TimesheetEntry.find({ timesheetId: timesheet._id })
      .sort({ entryDate: 1, createdAt: 1 })
      .populate('leaveTypeId', 'name isPaid')
      .lean();
    const projectIds = toObjectIdList(entriesRaw.map((e) => e.projectId));
    const projects = projectIds.length
      ? await Project.find({ _id: { $in: projectIds } }).select('_id name projectCode').lean()
      : [];
    const projectMap = new Map(projects.map((p) => [String(p._id), p]));
    if (req.user.role === 'manager') {
      if (String(timesheet.employeeId) === String(req.user._id)) {
        return res.status(403).json({ success: false, message: 'Manager self-timesheet can only be viewed by admin' });
      }
      const allowed = await managerCanEditEmployeeTimesheet(connection, req.user._id, timesheet.employeeId);
      if (!allowed) {
        return res.status(403).json({ success: false, message: 'Not allowed to view this timesheet' });
      }
    }

    const entries = entriesRaw.map((entry) => {
      const project = projectMap.get(String(entry.projectId || ''));
      const lt = entry.leaveTypeId;
      const leaveTypeName = lt && typeof lt === 'object' && lt.name ? lt.name : null;
      const leaveTypeIdFlat = lt && typeof lt === 'object' && lt._id ? lt._id : entry.leaveTypeId;
      return {
        ...entry,
        leaveTypeId: leaveTypeIdFlat,
        leaveTypeName,
        projectName: project?.name || project?.projectCode || null
      };
    });
    const summary = computeTimesheetEntrySummary(entries, timesheet.periodStart, timesheet.periodEnd);
    summary.projectNames = [
      ...new Set(entries.map((e) => e.projectName).filter(Boolean))
    ].slice(0, 8);

    res.json({
      success: true,
      data: { timesheet, entries, employeeName, summary }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.approveWholeWeek = async (req, res) => {
  try {
    const connection = ensureTenant(req);
    const { Timesheet, TimesheetEntry } = getTimesheetModels(connection);
    const ts = await Timesheet.findById(req.params.id);
    if (!ts) return res.status(404).json({ success: false, message: 'Timesheet not found' });
    if (req.user.role === 'manager' && String(ts.employeeId) === String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Manager self-timesheet can only be approved by admin' });
    }

    await TimesheetEntry.updateMany(
      {
        timesheetId: ts._id,
        sliceStatus: { $in: ['submitted', 'under_review', 'draft', 'sent_back'] }
      },
      {
        $set: {
          sliceStatus: 'approved',
          approvedBy: req.user._id,
          approvedAt: new Date(),
          sentBackReason: null
        }
      }
    );
    ts.overallStatus = 'fully_approved';
    await ts.save();
    res.json({ success: true, message: 'Whole week approved' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.sendBackDay = async (req, res) => {
  try {
    const { date, reason } = req.body;
    if (!date || !String(reason || '').trim()) {
      return res.status(400).json({ success: false, message: 'Date and reason are required' });
    }
    const connection = ensureTenant(req);
    const { Timesheet, TimesheetEntry } = getTimesheetModels(connection);
    const ts = await Timesheet.findById(req.params.id);
    if (!ts) return res.status(404).json({ success: false, message: 'Timesheet not found' });
    if (req.user.role === 'manager' && String(ts.employeeId) === String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Manager self-timesheet can only be actioned by admin' });
    }

    const dayKey = String(date).trim().slice(0, 10);
    const candidates = await TimesheetEntry.find({
      timesheetId: ts._id,
      entryType: { $in: [TimesheetEntryType.WORK, TimesheetEntryType.TRAINING, TimesheetEntryType.INTERNAL] },
      sliceStatus: { $in: [SliceStatus.SUBMITTED, SliceStatus.UNDER_REVIEW] }
    }).select('_id entryDate');

    const ids = candidates
      .filter((row) => entryCalendarDayKey(row.entryDate) === dayKey)
      .map((row) => row._id);

    if (!ids.length) {
      return res.status(400).json({
        success: false,
        message: 'No submitted project entries found for that day. Use a date from the table (YYYY-MM-DD).'
      });
    }

    await TimesheetEntry.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          sliceStatus: SliceStatus.SENT_BACK,
          sentBackReason: String(reason).trim(),
          approvedBy: null,
          approvedAt: null,
          isEditable: true
        }
      }
    );

    ts.overallStatus = TimesheetOverallStatus.PARTIALLY_APPROVED;
    await ts.save();
    res.json({
      success: true,
      message: 'Selected day sent back for correction',
      data: { date: dayKey, reason: String(reason).trim(), entriesUpdated: ids.length }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.lockPeriod = async (req, res) => {
  try {
    const connection = ensureTenant(req);
    const data = await lockTimesheet(connection, req.user, req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.adminUnlock = async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ success: false, message: 'Admin only' });
    if (!req.body.note) return res.status(400).json({ success: false, message: 'Unlock note required' });
    const connection = ensureTenant(req);
    const { Timesheet, TimesheetEntry } = getTimesheetModels(connection);
    const ts = await Timesheet.findById(req.params.id);
    if (!ts) return res.status(404).json({ success: false, message: 'Timesheet not found' });
    ts.overallStatus = 'fully_approved';
    ts.lockedAt = null;
    ts.lockedBy = null;
    await ts.save();
    await TimesheetEntry.updateMany({ timesheetId: ts._id }, { $set: { isEditable: true } });
    res.json({ success: true, message: 'Timesheet unlocked' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.bulkUploadPreview = async (req, res) => {
  try {
    const csv = req.body.csv || '';
    const parsed = parseCsv(csv);
    const { valid, errors } = validateParsedRows(parsed);
    res.json({
      success: true,
      data: {
        totalRows: parsed.length,
        validRows: valid.length,
        failedRows: errors.length,
        valid,
        errors
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.bulkUploadCommit = async (req, res) => {
  try {
    const connection = ensureTenant(req);
    const csv = req.body.csv || '';
    const parsed = parseCsv(csv);
    const { valid, errors } = validateParsedRows(parsed);
    const { BulkUploadJob, TimesheetEntry } = getTimesheetModels(connection);
    const job = await BulkUploadJob.create({
      uploadedBy: req.user._id,
      fileUrl: 'inline_csv_payload',
      status: 'processing',
      totalRows: parsed.length,
      successfulRows: 0,
      failedRows: 0,
      errorReport: []
    });

    let successfulRows = 0;
    const mutableErrors = [...errors];
    for (const row of valid) {
      try {
        const week = startOfWeek(new Date(row.entryDate));
        const ts = await ensureWeekTimesheet(connection, row.employeeId, week);
        const existing = await TimesheetEntry.findOne({
          timesheetId: ts._id,
          entryDate: new Date(row.entryDate),
          projectId: new mongoose.Types.ObjectId(row.projectId)
        });
        if (existing && req.body.overwriteExisting !== true) {
          mutableErrors.push({
            row_number: row._rowNumber || null,
            employee_id: row.employeeId,
            reason: 'Entry already exists. Overwrite? yes/no'
          });
          continue;
        }
        if (existing && req.body.overwriteExisting === true) {
          const wh = Number(row.hours);
          await TimesheetEntry.findByIdAndUpdate(existing._id, {
            $set: {
              hours: wh,
              workedHours: wh,
              payableHours: wh,
              taskDescription: row.taskDescription,
              isBillable: row.isBillable,
              entryType: row.entryType,
              source: TimesheetEntrySource.BULK_UPLOAD,
              filledBy: req.user._id
            }
          });
        } else {
          const wh = Number(row.hours);
          await TimesheetEntry.create({
            timesheetId: ts._id,
            entryDate: new Date(row.entryDate),
            projectId: new mongoose.Types.ObjectId(row.projectId),
            taskDescription: row.taskDescription,
            hours: wh,
            workedHours: wh,
            payableHours: wh,
            entryType: row.entryType,
            isBillable: row.isBillable,
            filledBy: req.user._id,
            source: TimesheetEntrySource.BULK_UPLOAD
          });
        }
        successfulRows += 1;
      } catch (error) {
        mutableErrors.push({
          row_number: row._rowNumber || null,
          employee_id: row.employeeId,
          reason: error.message
        });
      }
    }

    job.successfulRows = successfulRows;
    job.failedRows = mutableErrors.length;
    job.errorReport = mutableErrors;
    job.status = mutableErrors.length ? 'completed_with_errors' : 'completed';
    await job.save();

    res.json({
      success: true,
      data: {
        jobId: job._id,
        summary: `${successfulRows}/${parsed.length} rows processed successfully`,
        errors: mutableErrors
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
