const mongoose = require('mongoose');
const { getLeaveModels } = require('../models/leaveModels');
const {
  submitLeaveRequest,
  actionLeaveRequest,
  withdrawLeaveRequest,
  adminOverrideLeave
} = require('../services/leaveService');
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
    const { LeaveAllocation } = getLeaveModels(connection);
    const { employeeIds = [], leaveTypeId, year, days } = req.body;
    const updates = await Promise.all(
      employeeIds.map((employeeId) =>
        LeaveAllocation.findOneAndUpdate(
          { employeeId, leaveTypeId, year },
          {
            $setOnInsert: { createdBy: req.user._id },
            $set: { totalAllocated: days }
          },
          { upsert: true, new: true }
        )
      )
    );
    res.json({ success: true, data: updates });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
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
    const holiday = await Holiday.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, data: holiday });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.listHolidays = async (req, res) => {
  try {
    const connection = ensureTenant(req);
    const { Holiday } = getLeaveModels(connection);
    const data = await Holiday.find({}).sort({ date: 1 });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

    const formatUserName = (user) => {
      if (!user) return 'Unknown User';
      return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || user.email || 'Unknown User';
    };

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

    res.json({ success: true, data: [...v2, ...legacyMapped] });
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
