const { getTenantModel } = require('../utils/tenantModels');
const TenantUserSchema = require('../models/tenant/TenantUser');
const LeaveRequestSchema = require('../models/tenant/LeaveRequest');
const { protect, authorize } = require('../middlewares/auth');

// @desc    Get team members reporting to SPC manager
// @route   GET /api/spc-manager/team-members
// @access  Private (SPC Manager only)
exports.getTeamMembers = async (req, res) => {
  try {
    const managerEmail = req.user.email;
    const tenantConnection = req.tenant.connection;

    console.log(`📊 Fetching SPC team members for manager: ${managerEmail}`);

    // Get tenant user model
    const TenantUser = tenantConnection.model('User', TenantUserSchema);

    // Find all users reporting to this manager
    const teamMembers = await TenantUser.find({
      reportingManager: managerEmail,
      isActive: true
    })
    .select('-password')
    .sort({ firstName: 1 });

    res.status(200).json({
      success: true,
      count: teamMembers.length,
      data: teamMembers
    });
  } catch (error) {
    console.error('Error fetching SPC team members:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get SPC team statistics
// @route   GET /api/spc-manager/team-stats
// @access  Private (SPC Manager only)
exports.getTeamStats = async (req, res) => {
  try {
    const managerEmail = req.user.email;
    const tenantConnection = req.tenant.connection;

    console.log(`📊 Fetching SPC team stats for manager: ${managerEmail}`);

    // Get tenant user and leave request models
    const TenantUser = tenantConnection.model('User', TenantUserSchema);
    const LeaveRequest = tenantConnection.model('LeaveRequest', LeaveRequestSchema);

    // Get total team members
    const totalMembers = await TenantUser.countDocuments({
      reportingManager: managerEmail,
      isActive: true
    });

    // Get present today (mock for now - would integrate with attendance)
    const present = Math.floor(totalMembers * 0.8); // 80% attendance rate

    // Get pending leave requests
    const pendingApprovals = await LeaveRequest.countDocuments({
      reportingManager: managerEmail,
      status: 'pending'
    });

    // Get on leave today
    const onLeave = await LeaveRequest.countDocuments({
      reportingManager: managerEmail,
      status: 'approved',
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    const stats = {
      totalMembers,
      present,
      onLeave,
      pendingApprovals
    };

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching SPC team stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get pending leave requests for SPC team
// @route   GET /api/spc-manager/pending-leaves
// @access  Private (SPC Manager only)
exports.getPendingLeaves = async (req, res) => {
  try {
    const managerEmail = req.user.email;

    console.log(`📊 Fetching SPC pending leaves for manager: ${managerEmail}`);

    // Fetch pending leave requests for this manager's team
    const pendingLeaves = await Leave.find({
      employee: { $in: await Employee.find({ reportingManager: managerEmail }).distinct('_id') },
      status: 'pending'
    })
    .populate('employee', 'firstName lastName email employeeCode')
    .sort({ createdAt: -1 });

    console.log(`✅ Found ${pendingLeaves.length} pending SPC leave requests`);

    res.status(200).json({
      success: true,
      count: pendingLeaves.length,
      data: pendingLeaves
    });
  } catch (error) {
    console.error('Error fetching SPC pending leaves:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Approve leave request for SPC
// @route   PUT /api/spc-manager/leave/:id/approve
// @access  Private (SPC Manager only)
exports.approveLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;
    const managerEmail = req.user.email;
    const managerName = `${req.user.firstName} ${req.user.lastName}`;

    // Find leave request
    const leaveRequest = await Leave.findById(id);

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }

    // Verify it's for this manager's team
    const teamEmployeeIds = await Employee.find({ reportingManager: managerEmail }).distinct('_id');
    if (!teamEmployeeIds.includes(leaveRequest.employee.toString())) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to approve this leave request'
      });
    }

    // Update leave request
    leaveRequest.status = 'approved';
    leaveRequest.approvedBy = managerName;
    leaveRequest.approvedByEmail = managerEmail;
    leaveRequest.approvedOn = new Date();
    leaveRequest.approvalComments = comments || '';

    await leaveRequest.save();

    console.log(`✅ SPC Leave approved: ${id} by ${managerEmail}`);

    res.status(200).json({
      success: true,
      message: 'Leave request approved successfully',
      data: leaveRequest
    });
  } catch (error) {
    console.error('Error approving SPC leave:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Reject leave request for SPC
// @route   PUT /api/spc-manager/leave/:id/reject
// @access  Private (SPC Manager only)
exports.rejectLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const managerEmail = req.user.email;
    const managerName = `${req.user.firstName} ${req.user.lastName}`;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    // Find leave request
    const leaveRequest = await Leave.findById(id);

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }

    // Verify it's for this manager's team
    const teamEmployeeIds = await Employee.find({ reportingManager: managerEmail }).distinct('_id');
    if (!teamEmployeeIds.includes(leaveRequest.employee.toString())) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to reject this leave request'
      });
    }

    // Update leave request
    leaveRequest.status = 'rejected';
    leaveRequest.rejectedBy = managerName;
    leaveRequest.rejectedByEmail = managerEmail;
    leaveRequest.rejectedOn = new Date();
    leaveRequest.rejectionReason = reason;

    await leaveRequest.save();

    console.log(`❌ SPC Leave rejected: ${id} by ${managerEmail}`);

    res.status(200).json({
      success: true,
      message: 'Leave request rejected successfully',
      data: leaveRequest
    });
  } catch (error) {
    console.error('Error rejecting SPC leave:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get SPC manager's assigned projects
// @route   GET /api/spc-manager/projects
// @access  Private (SPC Manager only)
exports.getManagerProjects = async (req, res) => {
  try {
    const managerId = req.user._id || req.user.id;
    const managerEmail = req.user.email;
    const tenantConnection = req.tenant.connection;

    console.log(`📊 Fetching SPC projects for manager: ${managerEmail}`);

    // Get tenant models
    const Project = getTenantModel(tenantConnection, 'Project');
    const Client = getTenantModel(tenantConnection, 'Client');
    const TenantUser = tenantConnection.model('User', TenantUserSchema);

    // Find projects where manager is projectManager or team member
    const projects = await Project.find({
      $or: [
        { projectManager: managerId },
        { 'teamMembers.employee': managerId, 'teamMembers.isActive': true }
      ],
      isActive: true
    })
    .populate('client', 'name clientCode')
    .populate('projectManager', 'firstName lastName email')
    .populate('teamMembers.employee', 'firstName lastName email employeeCode designation')
    .sort({ createdAt: -1 })
    .lean();

    // Enrich project data with manager's role
    const enrichedProjects = projects.map(project => {
      const isProjectManager = project.projectManager?._id?.toString() === managerId.toString();
      const teamMemberInfo = project.teamMembers?.find(
        tm => tm.employee?._id?.toString() === managerId.toString() && tm.isActive
      );

      return {
        ...project,
        managerRole: isProjectManager ? 'Project Manager' : teamMemberInfo?.role || 'Team Member',
        isCurrentProject: project.status === 'active',
        myStartDate: teamMemberInfo?.startDate,
        myEndDate: teamMemberInfo?.endDate,
        teamSize: project.teamMembers?.filter(tm => tm.isActive).length || 0
      };
    });

    // Separate current and past projects
    const currentProjects = enrichedProjects.filter(p => p.isCurrentProject);
    const pastProjects = enrichedProjects.filter(p => !p.isCurrentProject);

    res.status(200).json({
      success: true,
      count: enrichedProjects.length,
      data: {
        current: currentProjects,
        past: pastProjects,
        all: enrichedProjects
      }
    });
  } catch (error) {
    console.error('Error fetching SPC manager projects:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create and assign a new project for SPC manager's team
// @route   POST /api/spc-manager/projects
// @access  Private (SPC Manager only)
exports.assignProject = async (req, res) => {
  try {
    const {
      projectName,
      description,
      startDate,
      endDate,
      priority = 'medium',
      clientId,
      location,
      selectedEmployees
    } = req.body;

    const managerId = req.user._id || req.user.id;
    const managerEmail = req.user.email;

    if (!projectName || !description || !startDate || !clientId || !location) {
      return res.status(400).json({
        success: false,
        message: 'Project name, description, start date, client, and location are required'
      });
    }

    if (!Array.isArray(selectedEmployees) || selectedEmployees.length === 0) {
      return res.status(400).json({ success: false, message: 'Select at least one team member' });
    }

    const client = await Client.findById(clientId).select('_id name');
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    // Validate selected employees belong to this manager
    const teamMembers = await Employee.find({
      _id: { $in: selectedEmployees },
      reportingManager: managerEmail,
      isActive: true
    }).select('_id firstName lastName email');

    if (teamMembers.length !== selectedEmployees.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more selected employees are invalid or not part of your team'
      });
    }

    // Generate project code
    const currentYear = new Date().getFullYear();
    const latestProject = await Project.findOne()
      .sort({ createdAt: -1 })
      .select('projectCode')
      .lean();

    let nextSequence = 1;
    if (latestProject && latestProject.projectCode) {
      const match = latestProject.projectCode.match(/PRJ(\d{4})(\d+)/);
      if (match && parseInt(match[1], 10) === currentYear) {
        nextSequence = parseInt(match[2], 10) + 1;
      }
    }

    const projectCode = `PRJ${currentYear}${String(nextSequence).padStart(5, '0')}`;

    const newProject = await Project.create({
      projectCode,
      name: projectName,
      client: client._id,
      description,
      location,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : undefined,
      status: 'active',
      priority,
      projectManager: managerId,
      teamMembers: teamMembers.map(member => ({
        employee: member._id,
        role: 'Team Member',
        startDate: new Date(startDate),
        isActive: true
      }))
    });

    const populatedProject = await Project.findById(newProject._id)
      .populate('client', 'name clientCode')
      .populate('teamMembers.employee', 'firstName lastName email employeeCode designation')
      .lean();

    return res.status(201).json({
      success: true,
      message: 'SPC Project assigned successfully',
      data: populatedProject
    });
  } catch (error) {
    console.error('Error assigning SPC project:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update SPC project progress
// @route   PUT /api/spc-manager/projects/:id/progress
// @access  Private (SPC Project Manager only)
exports.updateProjectProgress = async (req, res) => {
  try {
    const { id } = req.params;
    let { percentage, status } = req.body;
    const managerId = req.user._id || req.user.id;

    if (percentage === undefined && !status) {
      return res.status(400).json({
        success: false,
        message: 'Provide progress percentage or status to update'
      });
    }

    if (percentage !== undefined) {
      const parsed = Number(percentage);
      if (Number.isNaN(parsed)) {
        return res.status(400).json({ success: false, message: 'Progress percentage must be a number' });
      }
      percentage = Math.max(0, Math.min(100, parsed));
    }

    const allowedStatuses = ['not-started', 'in-progress', 'at-risk', 'completed'];
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid progress status' });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    if (!project.projectManager || project.projectManager.toString() !== managerId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the project manager can update project progress'
      });
    }

    const updatedProgress = {
      ...project.progress,
      updatedAt: new Date(),
      updatedBy: managerId
    };

    if (percentage !== undefined) {
      updatedProgress.percentage = percentage;
    } else if (updatedProgress.percentage === undefined) {
      updatedProgress.percentage = 0;
    }

    if (status) {
      updatedProgress.status = status;
    } else {
      // Derive status if not explicitly set
      if (updatedProgress.percentage >= 100) {
        updatedProgress.status = 'completed';
      } else if (updatedProgress.percentage > 0) {
        updatedProgress.status = updatedProgress.status && updatedProgress.status !== 'not-started'
          ? updatedProgress.status
          : 'in-progress';
      } else {
        updatedProgress.status = 'not-started';
      }
    }

    project.progress = updatedProgress;
    await project.save();

    const populatedProject = await Project.findById(project._id)
      .populate('client', 'name clientCode')
      .populate('teamMembers.employee', 'firstName lastName email employeeCode designation')
      .lean();

    return res.status(200).json({
      success: true,
      message: 'SPC Project progress updated successfully',
      data: populatedProject
    });
  } catch (error) {
    console.error('Error updating SPC project progress:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get clients list for SPC manager project assignment
// @route   GET /api/spc-manager/clients
// @access  Private (SPC Manager only)
exports.getManagerClients = async (req, res) => {
  try {
    const clients = await Client.find({})
      .select('name companyName clientCode email phone status contactPerson')
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: clients.length,
      data: clients
    });
  } catch (error) {
    console.error('Error fetching SPC manager clients:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create team meeting for SPC
// @route   POST /api/spc-manager/meetings
// @access  Private (SPC Manager only)
exports.createTeamMeeting = async (req, res) => {
  try {
    const {
      title,
      description,
      meetingDate,
      startTime,
      duration = 30,
      meetingType = 'online',
      location,
      meetingLink,
      attendees = []
    } = req.body;

    const managerId = req.user._id || req.user.id;
    const managerEmail = req.user.email;

    if (!title?.trim()) {
      return res.status(400).json({ success: false, message: 'Meeting title is required' });
    }

    if (!meetingDate || !startTime) {
      return res.status(400).json({ success: false, message: 'Meeting date and time are required' });
    }

    if (meetingType === 'online' && !meetingLink) {
      return res.status(400).json({ success: false, message: 'Meeting link is required for online meetings' });
    }

    if (meetingType === 'offline' && !location) {
      return res.status(400).json({ success: false, message: 'Location is required for offline meetings' });
    }

    const combinedDate = new Date(`${meetingDate}T${startTime}`);
    if (Number.isNaN(combinedDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid meeting date or time' });
    }

    // Get team members
    const teamMembers = await Employee.find({
      reportingManager: managerEmail,
      isActive: true
    }).select('_id');

    const teamMemberIds = new Set(teamMembers.map(member => member._id.toString()));
    const selectedAttendees = (Array.isArray(attendees) ? attendees : [])
      .filter(id => typeof id === 'string' || typeof id === 'object')
      .map(id => id.toString())
      .filter(id => teamMemberIds.has(id));

    if (selectedAttendees.length === 0) {
      return res.status(400).json({ success: false, message: 'Select at least one valid team member' });
    }

    // Always include the manager
    selectedAttendees.push(managerId.toString());

    const meeting = {
      title: title.trim(),
      description,
      meetingDate,
      startTime,
      startDateTime: combinedDate,
      duration,
      meetingType,
      location: meetingType === 'offline' ? location : undefined,
      meetingLink: meetingType === 'online' ? meetingLink : undefined,
      attendees: [...new Set(selectedAttendees)],
      createdBy: managerId,
      status: 'scheduled',
      createdAt: new Date()
    };

    // For now, return the meeting data (in a real implementation, you'd save to a Meeting collection)
    return res.status(201).json({
      success: true,
      message: 'SPC Meeting scheduled successfully',
      data: meeting
    });
  } catch (error) {
    console.error('Error scheduling SPC meeting:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get SPC team reports
// @route   GET /api/spc-manager/team-reports
// @access  Private (SPC Manager only)
exports.getTeamReports = async (req, res) => {
  try {
    const managerEmail = req.user.email;

    console.log(`📊 Fetching SPC team reports for manager: ${managerEmail}`);

    // Get team members
    const teamMembers = await Employee.find({
      reportingManager: managerEmail,
      isActive: true
    }).populate('department', 'name');

    // Get projects data
    const projects = await Project.find({
      projectManager: req.user._id,
      isActive: true
    }).populate('teamMembers.employee', 'firstName lastName email');

    // Get leave data
    const leaveData = await Leave.find({
      employee: { $in: teamMembers.map(m => m._id) },
      createdAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)) }
    });

    const reports = {
      teamOverview: {
        totalMembers: teamMembers.length,
        departmentDistribution: teamMembers.reduce((acc, member) => {
          const dept = member.department?.name || 'Unassigned';
          acc[dept] = (acc[dept] || 0) + 1;
          return acc;
        }, {})
      },
      projectSummary: {
        totalProjects: projects.length,
        activeProjects: projects.filter(p => p.status === 'active').length,
        completedProjects: projects.filter(p => p.status === 'completed').length,
        averageProgress: projects.reduce((sum, p) => sum + (p.progress?.percentage || 0), 0) / projects.length || 0
      },
      leaveAnalytics: {
        totalLeaves: leaveData.length,
        approvedLeaves: leaveData.filter(l => l.status === 'approved').length,
        pendingLeaves: leaveData.filter(l => l.status === 'pending').length,
        rejectedLeaves: leaveData.filter(l => l.status === 'rejected').length
      }
    };

    res.status(200).json({
      success: true,
      data: reports
    });
  } catch (error) {
    console.error('Error fetching SPC team reports:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
