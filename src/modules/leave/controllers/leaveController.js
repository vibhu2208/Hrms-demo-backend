const mongoose = require('mongoose');
const { getLeaveModels } = require('../models/leaveModels');
const {
  submitLeaveRequest,
  actionLeaveRequest,
  withdrawLeaveRequest,
  adminOverrideLeave,
  getTeamMemberIdsForManager,
  filterLeaveRowsForManager,
  enrichLeaveRowsWithApprovers
} = require('../services/leaveService');
const { fetchHolidaysForRangeDocs } = require('../services/holidayRangeHelper');
const { validateLeaveTypePolicy } = require('../services/leavePolicy');

function ensureTenant(req) {
  if (!req.tenant?.connection) throw new Error('Tenant connection unavailable');
  return req.tenant.connection;
}

function isAdmin(role) {
  return role === 'admin' || role === 'company_admin';
}

async function getUserModel(connection) {
  const schema = require('../../../models/tenant/TenantUser');
  return connection.models.User || connection.model('User', schema);
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

function formatUserName(user) {
  if (!user) return 'Unknown User';
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || user.email || 'Unknown User';
}

function toObjectIds(ids) {
  return [...ids]
    .filter(Boolean)
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

function ymdKey(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addLeaveDaysToCalendar(calendar, fromDate, toDate, rangeStart, rangeEnd, event) {
  let cur = startOfDay(new Date(fromDate));
  const last = startOfDay(new Date(toDate));
  const rs = startOfDay(new Date(rangeStart));
  const re = startOfDay(new Date(rangeEnd));
  while (cur <= last) {
    if (cur >= rs && cur <= re) {
      const key = ymdKey(cur);
      if (!calendar[key]) calendar[key] = [];
      calendar[key].push(event);
    }
    const next = new Date(cur);
    next.setDate(next.getDate() + 1);
    cur = next;
  }
}

exports.createLeaveType = async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ success: false, message: 'Admin only' });
    const connection = ensureTenant(req);
    const { LeaveType } = getLeaveModels(connection);
    const payload = validateLeaveTypePolicy(req.body);
    const leaveType = await LeaveType.create({ ...payload, createdBy: req.user._id });
    res.status(201).json({ success: true, data: leaveType });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listLeaveTypes = async (req, res) => {
  try {
    const connection = ensureTenant(req);
    const { LeaveType } = getLeaveModels(connection);
    const filter = req.query.includeArchived === 'true' ? {} : { isArchived: false };
    const data = await LeaveType.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateLeaveType = async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ success: false, message: 'Admin only' });
    const connection = ensureTenant(req);
    const { LeaveType } = getLeaveModels(connection);
    const payload = validateLeaveTypePolicy(req.body);
    const data = await LeaveType.findByIdAndUpdate(req.params.id, payload, { new: true });
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.bulkAllocateLeaves = async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ success: false, message: 'Admin only' });
    const connection = ensureTenant(req);
    const { processLeaveAllocationRequest } = require('../services/leaveAllocationService');
    const data = await processLeaveAllocationRequest(connection, req.user, req.body);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/** Dashboard-style counts for the leave allocation admin screen */
exports.adminLeaveAllocationsSummary = async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ success: false, message: 'Admin only' });
    const connection = ensureTenant(req);
    const { LeaveAllocation, LeaveType } = getLeaveModels(connection);
    const User = await getUserModel(connection);
    const y = req.query.year;
    const year = y != null && y !== '' && !Number.isNaN(Number(y)) ? Number(y) : new Date().getFullYear();
    const [totalAllocations, activeLeaveTypes, employeesCovered] = await Promise.all([
      LeaveAllocation.countDocuments({ year }),
      LeaveType.countDocuments({ isArchived: false }),
      User.countDocuments({ isActive: true, role: { $in: ['employee', 'hr', 'manager'] } })
    ]);
    res.json({
      success: true,
      data: { totalAllocations, activeLeaveTypes, employeesCovered, year }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.adminRecentAllocations = async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ success: false, message: 'Admin only' });
    const connection = ensureTenant(req);
    const { LeaveAllocation } = getLeaveModels(connection);
    const y = req.query.year;
    const year = y != null && y !== '' && !Number.isNaN(Number(y)) ? Number(y) : new Date().getFullYear();
    const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
    const rows = await LeaveAllocation.find({ year })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .populate('leaveTypeId', 'name')
      .populate('employeeId', 'firstName lastName email employeeCode')
      .lean();

    const fmt = (u) => {
      if (!u) return '—';
      const n = `${u.firstName || ''} ${u.lastName || ''}`.trim();
      return n || u.email || u.employeeCode || '—';
    };

    const data = rows.map((r) => ({
      _id: r._id,
      employeeName: fmt(r.employeeId),
      employeeCode: r.employeeId?.employeeCode || null,
      leaveTypeName: r.leaveTypeId?.name || '—',
      totalAllocated: r.totalAllocated,
      used: r.used,
      pending: r.pending,
      allocationType: r.allocationType || 'employee_specific',
      updatedAt: r.updatedAt
    }));

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.overrideAllocation = async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ success: false, message: 'Admin only' });
    const connection = ensureTenant(req);
    const { LeaveAllocation } = getLeaveModels(connection);
    const { delta, reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: 'Reason is required' });
    const allocation = await LeaveAllocation.findById(req.params.id);
    if (!allocation) return res.status(404).json({ success: false, message: 'Allocation not found' });
    allocation.totalAllocated = Number((allocation.totalAllocated + Number(delta || 0)).toFixed(2));
    allocation.overrideNote = reason;
    await allocation.save();
    res.json({ success: true, data: allocation });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.createHoliday = async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ success: false, message: 'Admin only' });
    const connection = ensureTenant(req);
    const { Holiday } = getLeaveModels(connection);
    const allowed = ['name', 'date', 'isOptional', 'location', 'holidayType', 'isRecurringYearly', 'status'];
    const body = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) body[k] = req.body[k];
    }
    const holiday = await Holiday.create({ ...body, createdBy: req.user._id });
    res.status(201).json({ success: true, data: holiday });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listHolidays = async (req, res) => {
  try {
    const connection = ensureTenant(req);
    const { Holiday } = getLeaveModels(connection);
    const { year, q } = req.query;
    const clauses = [];
    if (year && /^\d{4}$/.test(String(year))) {
      const y = parseInt(year, 10);
      const start = new Date(Date.UTC(y, 0, 1));
      const end = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
      clauses.push({
        $or: [{ isRecurringYearly: true }, { date: { $gte: start, $lte: end } }]
      });
    }
    if (q && String(q).trim()) {
      const esc = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      clauses.push({ name: { $regex: esc, $options: 'i' } });
    }
    const filter = clauses.length ? { $and: clauses } : {};
    const data = await Holiday.find(filter).sort({ date: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateHoliday = async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ success: false, message: 'Admin only' });
    const connection = ensureTenant(req);
    const { Holiday } = getLeaveModels(connection);
    const allowed = ['name', 'date', 'isOptional', 'location', 'holidayType', 'isRecurringYearly', 'status'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    const doc = await Holiday.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ success: false, message: 'Holiday not found' });
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteHoliday = async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ success: false, message: 'Admin only' });
    const connection = ensureTenant(req);
    const { Holiday } = getLeaveModels(connection);
    await Holiday.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Holiday deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.applyLeave = async (req, res) => {
  try {
    const connection = ensureTenant(req);
    const leaveRequest = await submitLeaveRequest(connection, req.user, req.body);
    res.status(201).json({ success: true, data: leaveRequest });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.myLeaveHistory = async (req, res) => {
  try {
    const connection = ensureTenant(req);
    const { LeaveRequest } = getLeaveModels(connection);
    const data = await LeaveRequest.find({ appliedFor: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.myLeaveBalances = async (req, res) => {
  try {
    const connection = ensureTenant(req);
    const { LeaveAllocation } = getLeaveModels(connection);
    const data = await LeaveAllocation.find({ employeeId: req.user._id }).populate('leaveTypeId').sort({ year: -1 });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.withdrawLeave = async (req, res) => {
  try {
    const connection = ensureTenant(req);
    await withdrawLeaveRequest(connection, req.user, req.params.id);
    res.json({ success: true, message: 'Leave request withdrawn' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.managerLeaveQueue = async (req, res) => {
  try {
    const connection = ensureTenant(req);
    const { LeaveRequest, LeaveType } = getLeaveModels(connection);
    const User = await getUserModel(connection);
    const currentUser = await User.findById(req.user._id).select('role');
    if (!currentUser || !['manager', 'admin', 'company_admin'].includes(currentUser.role)) {
      return res.status(403).json({ success: false, message: 'Manager/Admin only' });
    }

    const isManagerRole = currentUser.role === 'manager';
    let teamMemberIds = [];
    if (isManagerRole) {
      teamMemberIds = await getTeamMemberIdsForManager(connection, req.user._id);
    }

    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    const v2Raw = await LeaveRequest.find({ status: 'pending' }).sort({ createdAt: 1 }).lean();

    // Backward compatibility with legacy leave requests collection
    const LegacyLeaveRequest =
      connection.models.LegacyLeaveRequest ||
      connection.model('LegacyLeaveRequest', new mongoose.Schema({}, { strict: false }), 'leaverequests');
    const legacyRaw = await LegacyLeaveRequest.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(100).lean();

    const LeaveTypeLegacy =
      connection.models.LegacyLeaveType ||
      connection.model('LegacyLeaveType', new mongoose.Schema({}, { strict: false }), 'leavetypes');

    const userIdSet = new Set();
    const leaveTypeIdSet = new Set();

    v2Raw.forEach((row) => {
      if (row.appliedFor) userIdSet.add(String(row.appliedFor));
      if (row.employeeId) userIdSet.add(String(row.employeeId));
      if (row.leaveTypeId) leaveTypeIdSet.add(String(row.leaveTypeId));
    });

    legacyRaw.forEach((row) => {
      const requesterId = row.appliedFor || row.employeeId || row.userId || row.requestedBy;
      if (requesterId) userIdSet.add(String(requesterId));
      const legacyLeaveTypeId = row.leaveTypeId || row.leaveType || row.typeId;
      if (legacyLeaveTypeId) leaveTypeIdSet.add(String(legacyLeaveTypeId));
    });

    const userIds = [...userIdSet]
      .filter(Boolean)
      .map((id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id));
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }).select('_id firstName lastName name email role').lean()
      : [];
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const leaveTypeIds = [...leaveTypeIdSet]
      .filter(Boolean)
      .map((id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id));
    const [v2LeaveTypes, legacyLeaveTypes] = await Promise.all([
      leaveTypeIds.length ? LeaveType.find({ _id: { $in: leaveTypeIds } }).select('_id name').lean() : [],
      leaveTypeIds.length ? LeaveTypeLegacy.find({ _id: { $in: leaveTypeIds } }).select('_id name leaveType').lean() : []
    ]);
    const leaveTypeMap = new Map();
    v2LeaveTypes.forEach((lt) => leaveTypeMap.set(String(lt._id), lt.name));
    legacyLeaveTypes.forEach((lt) => leaveTypeMap.set(String(lt._id), lt.name || lt.leaveType || 'Unknown Leave Type'));

    let v2 = v2Raw.map((row) => {
      const requesterId = row.appliedFor || row.employeeId;
      const leaveTypeId = row.leaveTypeId ? String(row.leaveTypeId) : null;
      return {
        ...row,
        requesterId,
        requesterName: formatUserName(userMap.get(String(requesterId || ''))),
        requesterRole: userMap.get(String(requesterId || ''))?.role || null,
        leaveTypeName: leaveTypeMap.get(String(leaveTypeId || '')) || 'Unknown Leave Type',
        source: 'v2',
        legacy: false
      };
    });

    let legacyMapped = legacyRaw.map((row) => {
      const requesterId = row.appliedFor || row.employeeId || row.userId || row.requestedBy;
      const leaveTypeId = row.leaveTypeId || row.leaveType || row.typeId;
      const leaveTypeName =
        leaveTypeMap.get(String(leaveTypeId || '')) ||
        row.leaveTypeName ||
        row.leaveType ||
        row.type ||
        'Unknown Leave Type';
      const durationDays = Number(row.durationDays || row.numberOfDays || row.days || 0) || undefined;
      return {
      _id: row._id,
      fromDate: row.startDate || row.fromDate || row.createdAt,
      toDate: row.endDate || row.toDate || row.createdAt,
      reason: row.reason || row.rejectionReason || '',
      status: row.status || 'pending',
      durationDays,
      requesterId,
      requesterName: formatUserName(userMap.get(String(requesterId || ''))),
      requesterRole: userMap.get(String(requesterId || ''))?.role || null,
      leaveTypeName,
      source: 'legacy',
      legacy: true
      };
    });

    // Managers should not see/action manager self-leave requests.
    if (currentUser.role === 'manager') {
      v2 = v2.filter((row) => row.requesterRole !== 'manager');
      legacyMapped = legacyMapped.filter((row) => row.requesterRole !== 'manager');
    }

    if (isManagerRole) {
      v2 = await enrichLeaveRowsWithApprovers(connection, v2);
      legacyMapped = await enrichLeaveRowsWithApprovers(connection, legacyMapped);
      v2 = await filterLeaveRowsForManager(connection, req.user._id, v2);
      legacyMapped = await filterLeaveRowsForManager(connection, req.user._id, legacyMapped);
    }

    const { q, leaveType, fromDate, toDate } = req.query;
    let combined = [...v2, ...legacyMapped];
    if (q && String(q).trim()) {
      const needle = String(q).trim().toLowerCase();
      combined = combined.filter((row) => (row.requesterName || '').toLowerCase().includes(needle));
    }
    if (leaveType && String(leaveType).trim()) {
      const lt = String(leaveType).trim().toLowerCase();
      combined = combined.filter((row) => (row.leaveTypeName || '').toLowerCase().includes(lt));
    }
    if (fromDate) {
      const fd = startOfDay(new Date(fromDate));
      if (!Number.isNaN(fd.getTime())) {
        combined = combined.filter((row) => new Date(row.toDate) >= fd);
      }
    }
    if (toDate) {
      const td = endOfDay(new Date(toDate));
      if (!Number.isNaN(td.getTime())) {
        combined = combined.filter((row) => new Date(row.fromDate) <= td);
      }
    }

    const statsEmployeeIds = isManagerRole
      ? [...new Set([...combined.map((r) => String(r.requesterId)).filter(Boolean), ...teamMemberIds])]
      : [];
    const teamObjectIds = toObjectIds(statsEmployeeIds);
    const statsScope = isManagerRole && teamObjectIds.length ? { appliedFor: { $in: teamObjectIds } } : {};

    const [approvedToday, rejectedToday, onLeaveRows] = await Promise.all([
      LeaveRequest.countDocuments({
        ...statsScope,
        status: 'approved',
        actionedAt: { $gte: todayStart, $lte: todayEnd }
      }),
      LeaveRequest.countDocuments({
        ...statsScope,
        status: 'rejected',
        actionedAt: { $gte: todayStart, $lte: todayEnd }
      }),
      LeaveRequest.find({
        ...statsScope,
        status: 'approved',
        fromDate: { $lte: todayEnd },
        toDate: { $gte: todayStart }
      })
        .select('appliedFor')
        .lean()
    ]);

    const onLeaveToday = new Set(onLeaveRows.map((r) => String(r.appliedFor))).size;

    res.json({
      success: true,
      data: combined,
      meta: {
        pendingCount: combined.length,
        approvedToday,
        rejectedToday,
        onLeaveToday,
        teamMemberCount: isManagerRole ? teamMemberIds.length : null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.managerTeamLeaveCalendar = async (req, res) => {
  try {
    const connection = ensureTenant(req);
    const { LeaveRequest, LeaveType, Holiday } = getLeaveModels(connection);
    const User = await getUserModel(connection);
    const currentUser = await User.findById(req.user._id).select('role');
    if (!currentUser || !['manager', 'admin', 'company_admin'].includes(currentUser.role)) {
      return res.status(403).json({ success: false, message: 'Manager/Admin only' });
    }

    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
    const rangeStart = startOfDay(new Date(year, month - 1, 1));
    const rangeEnd = endOfDay(new Date(year, month, 0));

    const isManagerRole = currentUser.role === 'manager';
    let teamMemberIds = [];
    if (isManagerRole) {
      teamMemberIds = await getTeamMemberIdsForManager(connection, req.user._id);
    }

    const leaveFilter = {
      status: { $in: ['pending', 'approved'] },
      fromDate: { $lte: rangeEnd },
      toDate: { $gte: rangeStart }
    };

    let leavesRaw = await LeaveRequest.find(leaveFilter).sort({ fromDate: 1 }).lean();
    const userIds = [...new Set(leavesRaw.map((r) => String(r.appliedFor)).filter(Boolean))];
    const users = userIds.length
      ? await User.find({ _id: { $in: toObjectIds(userIds) } })
          .select('_id firstName lastName name email role')
          .lean()
      : [];
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const leaveTypeIds = [...new Set(leavesRaw.map((r) => String(r.leaveTypeId)).filter(Boolean))];
    const leaveTypes = leaveTypeIds.length
      ? await LeaveType.find({ _id: { $in: toObjectIds(leaveTypeIds) } })
          .select('_id name')
          .lean()
      : [];
    const leaveTypeMap = new Map(leaveTypes.map((lt) => [String(lt._id), lt.name]));

    let leavesMapped = leavesRaw
      .filter((row) => {
        if (!isManagerRole) return true;
        const role = userMap.get(String(row.appliedFor))?.role;
        return role !== 'manager';
      })
      .map((row) => ({
        _id: row._id,
        requesterId: row.appliedFor,
        employeeId: row.appliedFor,
        appliedFor: row.appliedFor,
        requesterName: formatUserName(userMap.get(String(row.appliedFor))),
        leaveTypeName: leaveTypeMap.get(String(row.leaveTypeId)) || 'Leave',
        fromDate: row.fromDate,
        toDate: row.toDate,
        durationDays: row.durationDays,
        status: row.status,
        halfDay: row.halfDay,
        reason: row.reason || '',
        eligibleApproverIds: row.eligibleApproverIds || []
      }));

    if (isManagerRole) {
      leavesMapped = await enrichLeaveRowsWithApprovers(connection, leavesMapped);
      leavesMapped = await filterLeaveRowsForManager(connection, req.user._id, leavesMapped);
    }

    const leaves = leavesMapped;

    const holidayRows = await fetchHolidaysForRangeDocs(Holiday, rangeStart, rangeEnd);
    const holidays = holidayRows
      .filter((h) => (h.status || 'active') === 'active')
      .map((h) => ({
        _id: h._id,
        name: h.name,
        date: h.date,
        holidayType: h.holidayType,
        isRecurringYearly: h.isRecurringYearly,
        isOptional: h.isOptional
      }));

    res.json({
      success: true,
      data: { leaves, holidays, rangeStart, rangeEnd }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.managerActionLeave = async (req, res) => {
  try {
    const { decision, note } = req.body;
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'Invalid decision' });
    }
    const connection = ensureTenant(req);
    const data = await actionLeaveRequest(connection, req.user, req.params.id, decision, note);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.adminLeaveOverview = async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ success: false, message: 'Admin only' });
    const connection = ensureTenant(req);
    const { LeaveRequest, LeaveType } = getLeaveModels(connection);
    const User = await getUserModel(connection);

    const { startDate: startQ, endDate: endQ } = req.query;
    const now = new Date();
    let rangeStart = startQ ? startOfDay(new Date(startQ)) : startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    let rangeEnd = endQ ? endOfDay(new Date(endQ)) : endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    if (rangeStart > rangeEnd) {
      const t = rangeStart;
      rangeStart = rangeEnd;
      rangeEnd = t;
    }

    const v2Rows = await LeaveRequest.find({
      status: { $in: ['approved', 'pending'] },
      fromDate: { $lte: rangeEnd },
      toDate: { $gte: rangeStart }
    })
      .sort({ fromDate: 1 })
      .lean();

    const LegacyLeaveRequest =
      connection.models.LegacyLeaveRequest ||
      connection.model('LegacyLeaveRequest', new mongoose.Schema({}, { strict: false }), 'leaverequests');

    const legacyRows = await LegacyLeaveRequest.find({
      status: { $in: ['approved', 'pending'] },
      $or: [
        { startDate: { $lte: rangeEnd }, endDate: { $gte: rangeStart } },
        { fromDate: { $lte: rangeEnd }, toDate: { $gte: rangeStart } }
      ]
    })
      .limit(500)
      .sort({ createdAt: -1 })
      .lean();

    const userIdSet = new Set();
    v2Rows.forEach((r) => {
      if (r.appliedFor) userIdSet.add(String(r.appliedFor));
    });
    legacyRows.forEach((r) => {
      const uid = r.employeeId || r.appliedFor || r.userId || r.requestedBy;
      if (uid) userIdSet.add(String(uid));
    });

    const userIds = [...userIdSet]
      .filter(Boolean)
      .map((id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null))
      .filter(Boolean);
    const leaveTypeIds = [...new Set(v2Rows.map((r) => String(r.leaveTypeId || '')).filter(Boolean))]
      .map((id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null))
      .filter(Boolean);

    const [users, leaveTypes] = await Promise.all([
      userIds.length ? User.find({ _id: { $in: userIds } }).select('_id firstName lastName name email employeeCode department designation').lean() : [],
      leaveTypeIds.length ? LeaveType.find({ _id: { $in: leaveTypeIds } }).select('_id name').lean() : []
    ]);
    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const leaveTypeMap = new Map(leaveTypes.map((lt) => [String(lt._id), lt.name]));

    const fullName = (u) =>
      u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.name || u.email || 'Unknown' : 'Unknown';

    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    const seen = new Set();
    const leaves = [];

    for (const row of v2Rows) {
      const key = `v2:${String(row._id)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const u = userMap.get(String(row.appliedFor || ''));
      leaves.push({
        _id: row._id,
        legacy: false,
        employeeName: fullName(u),
        employeeCode: u?.employeeCode || null,
        department: u?.department || null,
        designation: u?.designation || null,
        leaveTypeName: leaveTypeMap.get(String(row.leaveTypeId || '')) || 'Leave',
        fromDate: row.fromDate,
        toDate: row.toDate,
        durationDays: row.durationDays,
        halfDay: row.halfDay,
        status: row.status,
        reason: row.reason || ''
      });
    }

    for (const row of legacyRows) {
      const key = `legacy:${String(row._id)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const from = row.startDate || row.fromDate;
      const to = row.endDate || row.toDate;
      if (!from || !to) continue;
      const requesterId = row.employeeId || row.appliedFor || row.userId || row.requestedBy;
      const u = userMap.get(String(requesterId || ''));
      const leaveTypeName = row.leaveTypeName || row.leaveType || row.type || 'Leave';
      const durationDays =
        Number(row.numberOfDays || row.durationDays || row.days || 0) || undefined;
      leaves.push({
        _id: row._id,
        legacy: true,
        employeeName: row.employeeName || fullName(u),
        employeeCode: u?.employeeCode || row.employeeCode || null,
        department: u?.department || null,
        designation: u?.designation || null,
        leaveTypeName,
        fromDate: from,
        toDate: to,
        durationDays,
        status: row.status || 'pending',
        reason: row.reason || ''
      });
    }

    leaves.sort((a, b) => new Date(a.fromDate) - new Date(b.fromDate));

    const [v2OnNow, v2Future, legacyOnNow, legacyFuture] = await Promise.all([
      LeaveRequest.countDocuments({
        status: 'approved',
        fromDate: { $lte: todayEnd },
        toDate: { $gte: todayStart }
      }),
      LeaveRequest.countDocuments({
        status: 'approved',
        fromDate: { $gt: todayEnd }
      }),
      LegacyLeaveRequest.countDocuments({
        status: 'approved',
        $or: [
          { startDate: { $lte: todayEnd }, endDate: { $gte: todayStart } },
          { fromDate: { $lte: todayEnd }, toDate: { $gte: todayStart } }
        ]
      }),
      LegacyLeaveRequest.countDocuments({
        status: 'approved',
        $or: [{ startDate: { $gt: todayEnd } }, { fromDate: { $gt: todayEnd } }]
      })
    ]);

    const onLeaveNow = v2OnNow + legacyOnNow;
    const plannedApproved = v2Future + legacyFuture;
    const pendingInRange = leaves.filter((L) => L.status === 'pending').length;

    const calendar = {};
    for (const L of leaves) {
      const ev = {
        id: L.legacy ? `legacy-${String(L._id)}` : String(L._id),
        employeeName: L.employeeName,
        employeeCode: L.employeeCode,
        leaveType: L.leaveTypeName,
        startDate: L.fromDate,
        endDate: L.toDate,
        numberOfDays: L.durationDays,
        status: L.status,
        reason: L.reason
      };
      addLeaveDaysToCalendar(calendar, L.fromDate, L.toDate, rangeStart, rangeEnd, ev);
    }

    const approvedInRange = leaves.filter((L) => L.status === 'approved').length;

    res.json({
      success: true,
      data: {
        range: { start: rangeStart, end: rangeEnd },
        summary: {
          onLeaveNow,
          plannedApproved,
          pendingInRange,
          approvedInRange
        },
        leaves,
        calendar
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.adminEscalationInbox = async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ success: false, message: 'Admin only' });
    const connection = ensureTenant(req);
    const { LeaveRequest, LeaveType } = getLeaveModels(connection);
    const User = await getUserModel(connection);

    const pending = await LeaveRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).lean();
    if (!pending.length) {
      return res.json({ success: true, data: [] });
    }

    const requesterIds = [...new Set(pending.map((row) => String(row.appliedFor || row.employeeId || '')).filter(Boolean))];
    const leaveTypeIds = [...new Set(pending.map((row) => String(row.leaveTypeId || '')).filter(Boolean))];

    const [users, leaveTypes] = await Promise.all([
      requesterIds.length
        ? User.find({ _id: { $in: requesterIds } }).select('_id firstName lastName name email role').lean()
        : [],
      leaveTypeIds.length ? LeaveType.find({ _id: { $in: leaveTypeIds } }).select('_id name').lean() : []
    ]);

    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const leaveTypeMap = new Map(leaveTypes.map((lt) => [String(lt._id), lt.name]));
    const fullName = (u) =>
      u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.name || u.email || 'Unknown User' : 'Unknown User';

    const data = pending
      .filter((row) => {
        const requester = userMap.get(String(row.appliedFor || row.employeeId || ''));
        const isManagerRequest = requester?.role === 'manager';
        return row.escalatedToAdmin === true || isManagerRequest;
      })
      .map((row) => {
        const requester = userMap.get(String(row.appliedFor || row.employeeId || ''));
        return {
          ...row,
          requesterName: fullName(requester),
          requesterRole: requester?.role || null,
          leaveTypeName: leaveTypeMap.get(String(row.leaveTypeId || '')) || 'Unknown Leave Type',
          inboxReason: row.escalatedToAdmin ? 'escalated' : 'manager_self_request'
        };
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.adminOverride = async (req, res) => {
  try {
    const { status, note } = req.body;
    if (!['approved', 'rejected', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid override status' });
    }
    const connection = ensureTenant(req);
    await adminOverrideLeave(connection, req.user, req.params.id, status, note);
    res.json({ success: true, message: 'Leave overridden' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
