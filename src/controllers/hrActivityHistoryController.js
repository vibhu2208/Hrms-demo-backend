const mongoose = require('mongoose');
const { getTenantModel } = require('../middlewares/tenantMiddleware');
const HRActivityHistorySchema = require('../models/tenant/HRActivityHistory');
const TenantUserSchema = require('../models/tenant/TenantUser');

const buildActivityQuery = ({ hrUserId, action, entityType, startDate, endDate, projectId }) => {
  const query = {};
  if (hrUserId) query.hrUserId = hrUserId;
  if (action) query.action = action;
  if (entityType) query.entityType = entityType;
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }
  if (projectId) {
    query.$or = [
      { 'metadata.projectId': String(projectId) },
      { entityType: 'project', entityId: projectId }
    ];
  }
  return query;
};

const resolveManagerVisibleHRIds = async (tenantConnection, managerUser, projectId) => {
  const TenantUser = tenantConnection.model('User', TenantUserSchema);
  const managerEmail = String(managerUser.email || '').toLowerCase();
  const managerId = String(managerUser._id || managerUser.id || '');

  const directHrUsers = await TenantUser.find({
    role: 'hr',
    reportingManager: managerEmail,
    isActive: true
  }).select('_id');

  const visibleHrIds = new Set(directHrUsers.map((u) => String(u._id)));

  if (!projectId) {
    return Array.from(visibleHrIds);
  }

  const Project = tenantConnection.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
  const project = await Project.findById(projectId).lean();

  if (!project) {
    return Array.from(visibleHrIds);
  }

  const assignedManagers = Array.isArray(project.assignedManagers) ? project.assignedManagers.map((id) => String(id)) : [];
  const projectManager = project.projectManager ? String(project.projectManager) : null;
  const createdBy = project.createdBy ? String(project.createdBy) : null;

  const managerHasProjectAccess =
    assignedManagers.includes(managerId) ||
    projectManager === managerId ||
    createdBy === managerId;

  if (!managerHasProjectAccess) {
    return Array.from(visibleHrIds);
  }

  const assignedHRs = Array.isArray(project.assignedHRs) ? project.assignedHRs.map((id) => String(id)) : [];
  for (const hrId of assignedHRs) visibleHrIds.add(hrId);

  return Array.from(visibleHrIds);
};

/**
 * @desc    Get HR Activity History Timeline
 * @route   GET /api/hr-activity-history
 * @access  Private (Admin, Company Admin, Manager)
 */
exports.getHRActivityHistory = async (req, res) => {
  try {
    const tenantConnection = req.tenant.connection;
    const HRActivityHistory = getTenantModel(tenantConnection, 'HRActivityHistory', HRActivityHistorySchema);

    const {
      hrUserId,
      action,
      entityType,
      startDate,
      endDate,
      projectId,
      page = 1,
      limit = 50
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filters = {
      hrUserId,
      action,
      entityType,
      startDate,
      endDate,
      projectId,
      limit: parseInt(limit),
      skip
    };

    console.log(`🔍 Applying filters:`, filters);

    const role = req.user?.role;
    let enforcedHrIds = null;
    if (role === 'manager') {
      const visibleHrIds = await resolveManagerVisibleHRIds(tenantConnection, req.user, projectId);
      enforcedHrIds = visibleHrIds;
      if (enforcedHrIds.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            activities: [],
            pagination: { total: 0, page: parseInt(page), limit: parseInt(limit), pages: 0 },
            stats: [],
            totalHRUsers: 0
          }
        });
      }
    }

    const baseQuery = buildActivityQuery({ hrUserId, action, entityType, startDate, endDate, projectId });
    if (enforcedHrIds) {
      baseQuery.hrUserId = {
        $in: enforcedHrIds.map((id) => new mongoose.Types.ObjectId(id))
      };
    }

    const activities = await HRActivityHistory.find(baseQuery)
      .populate('hrUserId', 'firstName lastName email role')
      .sort({ timestamp: -1 })
      .limit(Math.min(parseInt(limit) || 50, 1000))
      .skip(Math.max(skip, 0));
    console.log(`✅ Found ${activities.length} HR activity records`);

    const total = await HRActivityHistory.countDocuments(baseQuery);

    console.log(`📊 Total HR activity records in DB: ${total}`);

    // Get statistics
    const stats = await HRActivityHistory.aggregate([
      { $match: baseQuery },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Get unique HR users
    const hrUsers = await HRActivityHistory.distinct('hrUserId', baseQuery);

    console.log(`👥 Found ${hrUsers.length} unique HR users with activity`);

    res.status(200).json({
      success: true,
      data: {
        activities,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        },
        stats,
        totalHRUsers: hrUsers.length
      }
    });
  } catch (error) {
    console.error('Error fetching HR activity history:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch HR activity history',
      error: error.message
    });
  }
};

/**
 * @desc    Get HR Activity History for specific HR user
 * @route   GET /api/hr-activity-history/hr/:hrUserId
 * @access  Private (Admin, Company Admin, Manager)
 */
exports.getHRUserActivity = async (req, res) => {
  try {
    const tenantConnection = req.tenant.connection;
    const HRActivityHistory = getTenantModel(tenantConnection, 'HRActivityHistory', HRActivityHistorySchema);

    const { hrUserId } = req.params;
    const {
      action,
      entityType,
      startDate,
      endDate,
      projectId,
      page = 1,
      limit = 50
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filters = {
      hrUserId,
      action,
      entityType,
      startDate,
      endDate,
      projectId,
      limit: parseInt(limit),
      skip
    };

    const role = req.user?.role;
    if (role === 'manager') {
      const visibleHrIds = await resolveManagerVisibleHRIds(tenantConnection, req.user, projectId);
      if (!visibleHrIds.includes(String(hrUserId))) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to view this HR activity.'
        });
      }
    }

    const query = buildActivityQuery({ hrUserId, action, entityType, startDate, endDate, projectId });
    const activities = await HRActivityHistory.find(query)
      .populate('hrUserId', 'firstName lastName email role')
      .sort({ timestamp: -1 })
      .limit(Math.min(parseInt(limit) || 50, 1000))
      .skip(Math.max(skip, 0));
    const total = await HRActivityHistory.countDocuments(query);

    // Get statistics for this HR user
    const stats = await HRActivityHistory.aggregate([
      { $match: query },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        activities,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        },
        stats
      }
    });
  } catch (error) {
    console.error('Error fetching HR user activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch HR user activity',
      error: error.message
    });
  }
};

/**
 * @desc    Get HR Activity Statistics
 * @route   GET /api/hr-activity-history/stats
 * @access  Private (Admin, Company Admin, Manager)
 */
exports.getHRActivityStats = async (req, res) => {
  try {
    const tenantConnection = req.tenant.connection;
    const HRActivityHistory = getTenantModel(tenantConnection, 'HRActivityHistory', HRActivityHistorySchema);

    const { startDate, endDate, projectId } = req.query;

    let managerFilter = null;
    if (req.user?.role === 'manager') {
      const visibleHrIds = await resolveManagerVisibleHRIds(tenantConnection, req.user, projectId);
      if (visibleHrIds.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            totalActivities: 0,
            totalHRUsers: 0,
            activitiesByAction: [],
            topActiveHR: []
          }
        });
      }
      managerFilter = visibleHrIds.map((id) => new mongoose.Types.ObjectId(id));
    }

    const baseQuery = buildActivityQuery({ startDate, endDate, projectId });
    if (managerFilter) {
      baseQuery.hrUserId = { $in: managerFilter };
    }

    const stats = await HRActivityHistory.aggregate([
      { $match: baseQuery },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Get total activities count
    const totalActivities = await HRActivityHistory.countDocuments(baseQuery);

    // Get unique HR users count
    const hrUsers = await HRActivityHistory.distinct('hrUserId', baseQuery);

    // Get activities by HR user
    const activitiesByHR = await HRActivityHistory.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: '$hrUserId',
          hrName: { $first: '$hrName' },
          hrEmail: { $first: '$hrEmail' },
          activityCount: { $sum: 1 }
        }
      },
      { $sort: { activityCount: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalActivities,
        totalHRUsers: hrUsers.length,
        activitiesByAction: stats,
        topActiveHR: activitiesByHR
      }
    });
  } catch (error) {
    console.error('Error fetching HR activity statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch HR activity statistics',
      error: error.message
    });
  }
};
