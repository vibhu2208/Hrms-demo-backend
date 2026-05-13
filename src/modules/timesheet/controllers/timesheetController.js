const mongoose = require('mongoose');
const { getTimesheetModels } = require('../models/timesheetModels');
const {
  ensureWeekTimesheet,
  submitTimesheet,
  approveProjectSlice,
  lockTimesheet,
  autofillLeaveAndHolidays,
  startOfWeek
} = require('../services/sliceApprovalEngine');
const { parseCsv, validateParsedRows } = require('../services/bulkUploadParser');
const { TimesheetEntrySource } = require('../types/timesheet.types');

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
    managerAssignments
      .map((a) => a.projectId)
      .filter(Boolean)
      .map((id) => String(id))
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

  const managedProjectIds = [...managedProjectIdSet].map((id) =>
    mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
  );

  // Employee is editable if they are assigned/member/hr in any managed project.
  const employeeAssignment = await ProjectAssignment.findOne({
    projectId: { $in: [...managedProjectIds, ...managedProjectIds.map((id) => String(id))] },
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
      const week = req.query.week ? new Date(req.query.week) : new Date();
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
    const entries = await TimesheetEntry.find({ timesheetId: ts._id }).sort({ entryDate: 1, createdAt: 1 });
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
    const week = req.body.week ? new Date(req.body.week) : new Date();
    const ts = await ensureWeekTimesheet(connection, employeeId, week);
    const { TimesheetEntry } = getTimesheetModels(connection);
    const rows = req.body.entries || [];

    for (const row of rows) {
      if (row.id) {
        const existing = await TimesheetEntry.findById(row.id);
        if (!existing) continue;
        if (!existing.isEditable) continue;
        Object.assign(existing, {
          entryDate: row.entryDate,
          projectId: row.projectId || null,
          taskDescription: row.taskDescription || '',
          hours: row.hours,
          entryType: row.entryType || existing.entryType,
          isBillable: Boolean(row.isBillable),
          filledBy: req.user._id
        });
        await existing.save();
      } else {
        await TimesheetEntry.create({
          timesheetId: ts._id,
          entryDate: row.entryDate,
          projectId: row.projectId || null,
          taskDescription: row.taskDescription || '',
          hours: row.hours,
          entryType: row.entryType || 'work',
          isBillable: row.isBillable !== false,
          filledBy: req.user._id,
          source: TimesheetEntrySource.MANUAL
        });
      }
    }
    const entries = await TimesheetEntry.find({ timesheetId: ts._id }).sort({ entryDate: 1 });
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
    const v2Raw = await Timesheet.find({ overallStatus: { $in: ['submitted', 'partially_approved', 'fully_approved'] } }).sort({
      periodStart: -1
    });

    const v2EmployeeIds = [...new Set(v2Raw.map((row) => String(row.employeeId || '')).filter(Boolean))];
    const v2Users = await User.find({ _id: { $in: v2EmployeeIds } })
      .select('_id firstName lastName email role')
      .lean();
    const v2UserMap = new Map(v2Users.map((u) => [String(u._id), u]));

    let v2 = v2Raw.map((row) => {
      const u = v2UserMap.get(String(row.employeeId || ''));
      return {
        _id: row._id,
        employeeId: row.employeeId,
        employeeName: u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email : 'Unknown User',
        employeeRole: u?.role || null,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        overallStatus: row.overallStatus
      };
    });

    // Backward compatibility with legacy timesheets collection
    const LegacyTimesheet =
      connection.models.Timesheet || connection.model('Timesheet', new mongoose.Schema({}, { strict: false }), 'timesheets');
    const legacy = await LegacyTimesheet.find({
      status: { $in: ['submitted', 'approved', 'rejected'] }
    })
      .sort({ weekStartDate: -1 })
      .limit(100);

    const legacyEmployeeIds = [...new Set(legacy.map((row) => String(row.employee || row.employeeId || '')).filter(Boolean))];
    const legacyUsers = await User.find({ _id: { $in: legacyEmployeeIds } })
      .select('_id firstName lastName email role')
      .lean();
    const legacyUserMap = new Map(legacyUsers.map((u) => [String(u._id), u]));

    let legacyMapped = legacy.map((row) => {
      const employeeId = row.employee || row.employeeId || null;
      const u = legacyUserMap.get(String(employeeId || ''));
      return {
      _id: row._id,
      employeeId,
      employeeName: u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email : 'Unknown User',
      employeeRole: u?.role || null,
      periodStart: row.weekStartDate || row.periodStart || row.createdAt,
      periodEnd: row.weekEndDate || row.periodEnd || row.createdAt,
      overallStatus: row.status || 'submitted',
      source: 'legacy'
      };
    });

    // Managers can approve team timesheets, but never their own self-timesheet.
    if (currentUser.role === 'manager') {
      v2 = v2.filter((row) => String(row.employeeId || '') !== String(currentUser._id));
      legacyMapped = legacyMapped.filter((row) => String(row.employeeId || '') !== String(currentUser._id));
    }

    res.json({ success: true, data: [...v2, ...legacyMapped] });
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
    const entriesRaw = await TimesheetEntry.find({ timesheetId: timesheet._id }).sort({ entryDate: 1, createdAt: 1 }).lean();
    const projectIds = [...new Set(entriesRaw.map((e) => String(e.projectId || '')).filter(Boolean))];
    const projects = projectIds.length
      ? await Project.find({ _id: { $in: projectIds } }).select('_id name projectCode').lean()
      : [];
    const projectMap = new Map(projects.map((p) => [String(p._id), p]));
    const entries = entriesRaw.map((entry) => {
      const project = projectMap.get(String(entry.projectId || ''));
      return {
        ...entry,
        projectName: project?.name || project?.projectCode || null
      };
    });
    res.json({ success: true, data: { timesheet, entries, employeeName } });
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
    if (!date || !reason) {
      return res.status(400).json({ success: false, message: 'Date and reason are required' });
    }
    const connection = ensureTenant(req);
    const { Timesheet, TimesheetEntry } = getTimesheetModels(connection);
    const ts = await Timesheet.findById(req.params.id);
    if (!ts) return res.status(404).json({ success: false, message: 'Timesheet not found' });
    if (req.user.role === 'manager' && String(ts.employeeId) === String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Manager self-timesheet can only be actioned by admin' });
    }

    const selectedDate = new Date(date);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    const result = await TimesheetEntry.updateMany(
      {
        timesheetId: ts._id,
        entryDate: { $gte: selectedDate, $lt: nextDate }
      },
      {
        $set: {
          sliceStatus: 'sent_back',
          sentBackReason: reason,
          approvedBy: null,
          approvedAt: null
        }
      }
    );
    if (!result.modifiedCount) {
      return res.status(400).json({ success: false, message: 'No entries found for selected day' });
    }
    ts.overallStatus = 'partially_approved';
    await ts.save();
    res.json({ success: true, message: 'Selected day sent back for correction' });
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
          await TimesheetEntry.findByIdAndUpdate(existing._id, {
            $set: {
              hours: row.hours,
              taskDescription: row.taskDescription,
              isBillable: row.isBillable,
              entryType: row.entryType,
              source: TimesheetEntrySource.BULK_UPLOAD,
              filledBy: req.user._id
            }
          });
        } else {
          await TimesheetEntry.create({
            timesheetId: ts._id,
            entryDate: new Date(row.entryDate),
            projectId: new mongoose.Types.ObjectId(row.projectId),
            taskDescription: row.taskDescription,
            hours: row.hours,
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
