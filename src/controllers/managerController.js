const mongoose = require('mongoose');
const { getTenantConnection } = require('../config/database.config');
const { getTenantModel } = require('../utils/tenantModels');
const TenantUserSchema = require('../models/tenant/TenantUser');
const LeaveRequestSchema = require('../models/tenant/LeaveRequest');
const LeaveBalanceSchema = require('../models/tenant/LeaveBalance');

// @desc    Get team members reporting to manager
// @route   GET /api/manager/team-members
// @access  Private (Manager only)
exports.getTeamMembers = async (req, res) => {
  let tenantConnection = null;
  
  try {
    const managerEmail = req.user.email;
    const companyId = req.companyId; // From auth middleware

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID not found'
      });
    }

    console.log(`📊 Fetching team members for manager: ${managerEmail}, company: ${companyId}`);

    // Get tenant connection
    tenantConnection = await getTenantConnection(companyId);
    const TenantUser = tenantConnection.model('User', TenantUserSchema);

    // Find all employees reporting to this manager
    const teamMembers = await TenantUser.find({
      reportingManager: managerEmail,
      isActive: true
    }).select('-password').sort({ firstName: 1 });

    res.status(200).json({
      success: true,
      count: teamMembers.length,
      data: teamMembers
    });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Schedule a new team meeting
// @route   POST /api/manager/meetings
// @access  Private (Manager only)
exports.createTeamMeeting = async (req, res) => {
  let tenantConnection = null;

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
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(400).json({ success: false, message: 'Company ID not found' });
    }

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

    tenantConnection = await getTenantConnection(companyId);
    const TenantUser = tenantConnection.model('User', TenantUserSchema);
    const TeamMeeting = getTenantModel(tenantConnection, 'TeamMeeting');

    if (!TeamMeeting) {
      throw new Error('Team meeting model is not available for this tenant');
    }

    const teamMembers = await TenantUser.find({
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

    // Always include the manager in the attendee list
    selectedAttendees.push(managerId.toString());

    const meeting = await TeamMeeting.create({
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
      status: 'scheduled'
    });

    const populatedMeeting = await TeamMeeting.findById(meeting._id)
      .populate('attendees', 'firstName lastName email designation')
      .populate('createdBy', 'firstName lastName email');

    return res.status(201).json({
      success: true,
      message: 'Meeting scheduled successfully',
      data: populatedMeeting
    });
  } catch (error) {
    console.error('Error scheduling meeting:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get meetings scheduled by manager
// @route   GET /api/manager/meetings
// @access  Private (Manager only)
exports.getTeamMeetings = async (req, res) => {
  let tenantConnection = null;

  try {
    const managerId = req.user._id || req.user.id;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(400).json({ success: false, message: 'Company ID not found' });
    }

    tenantConnection = await getTenantConnection(companyId);
    const TeamMeeting = getTenantModel(tenantConnection, 'TeamMeeting');

    if (!TeamMeeting) {
      throw new Error('Team meeting model is not available for this tenant');
    }

    const meetings = await TeamMeeting.find({
      createdBy: managerId,
      isActive: { $ne: false }
    })
      .sort({ startDateTime: 1 })
      .populate('attendees', 'firstName lastName email designation')
      .lean();

    res.status(200).json({
      success: true,
      count: meetings.length,
      data: meetings
    });
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update project progress
// @route   PUT /api/manager/projects/:id/progress
// @access  Private (Project Manager only)
exports.updateProjectProgress = async (req, res) => {
  let tenantConnection = null;

  try {
    const { id } = req.params;
    let { percentage, status } = req.body;
    const managerId = req.user._id || req.user.id;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(400).json({ success: false, message: 'Company ID not found' });
    }

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
      return res.status(400).json({
        success: false,
        message: 'Invalid progress status'
      });
    }

    tenantConnection = await getTenantConnection(companyId);
    const Project = getTenantModel(tenantConnection, 'Project');

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
      message: 'Project progress updated successfully',
      data: populatedProject
    });
  } catch (error) {
    console.error('Error updating project progress:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create and assign a new project for manager's team
// @route   POST /api/manager/projects
// @access  Private (Manager only)
exports.assignProject = async (req, res) => {
  let tenantConnection = null;

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
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(400).json({ success: false, message: 'Company ID not found' });
    }

    if (!projectName || !description || !startDate || !clientId || !location) {
      return res.status(400).json({
        success: false,
        message: 'Project name, description, start date, client, and location are required'
      });
    }

    if (!Array.isArray(selectedEmployees) || selectedEmployees.length === 0) {
      return res.status(400).json({ success: false, message: 'Select at least one team member' });
    }

    tenantConnection = await getTenantConnection(companyId);
    const Project = getTenantModel(tenantConnection, 'Project');
    const Client = getTenantModel(tenantConnection, 'Client');
    const TenantUser = tenantConnection.model('User', TenantUserSchema);

    const client = await Client.findById(clientId).select('_id name');
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    // Validate selected employees belong to this manager
    const teamMembers = await TenantUser.find({
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

    // Generate project code similar to admin flow
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

    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : undefined;

    const newProject = await Project.create({
      projectCode,
      name: projectName,
      client: client._id,
      description,
      location,
      startDate: start,
      endDate: end,
      status: 'active',
      priority,
      projectManager: managerId,
      teamMembers: teamMembers.map(member => ({
        employee: member._id,
        role: 'Team Member',
        startDate: start,
        isActive: true
      }))
    });

    // Attempt to set current project for assigned employees (best effort)
    try {
      await TenantUser.updateMany(
        { _id: { $in: selectedEmployees } },
        {
          currentProject: newProject._id,
          currentClient: client._id
        }
      );
    } catch (updateError) {
      console.warn('Note: Unable to update tenant user current project fields', updateError.message);
    }

    const populatedProject = await Project.findById(newProject._id)
      .populate('client', 'name clientCode')
      .populate('teamMembers.employee', 'firstName lastName email employeeCode designation')
      .lean();

    return res.status(201).json({
      success: true,
      message: 'Project assigned successfully',
      data: populatedProject
    });
  } catch (error) {
    console.error('Error assigning project:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get team statistics
// @route   GET /api/manager/team-stats
// @access  Private (Manager only)
exports.getTeamStats = async (req, res) => {
  let tenantConnection = null;
  
  try {
    const managerEmail = req.user.email;
    const companyId = req.companyId; // From auth middleware

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID not found'
      });
    }

    console.log(`📊 Fetching team stats for manager: ${managerEmail}, company: ${companyId}`);

    // Get tenant connection
    tenantConnection = await getTenantConnection(companyId);
    const TenantUser = tenantConnection.model('User', TenantUserSchema);

    // Get total team members
    const totalMembers = await TenantUser.countDocuments({
      reportingManager: managerEmail,
      isActive: true
    });

    // TODO: Get attendance data for present/absent counts
    // For now, returning mock data structure
    const stats = {
      totalMembers: totalMembers,
      present: 0, // TODO: Calculate from today's attendance
      onLeave: 0, // TODO: Calculate from leave requests
      pendingApprovals: 0 // TODO: Calculate from pending leave requests
    };

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching team stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get clients list for manager project assignment
// @route   GET /api/manager/clients
// @access  Private (Manager only)
exports.getManagerClients = async (req, res) => {
  let tenantConnection = null;

  try {
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID not found'
      });
    }

    tenantConnection = await getTenantConnection(companyId);
    const Client = getTenantModel(tenantConnection, 'Client');

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
    console.error('Error fetching manager clients:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get pending leave requests for team
// @route   GET /api/manager/pending-leaves
// @access  Private (Manager only)
exports.getPendingLeaves = async (req, res) => {
  let tenantConnection = null;
  
  try {
    const managerEmail = req.user.email;
    const companyId = req.companyId; // From auth middleware

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID not found'
      });
    }

    console.log(`📊 Fetching pending leaves for manager: ${managerEmail}, company: ${companyId}`);

    // Get tenant connection
    tenantConnection = await getTenantConnection(companyId);
    const LeaveRequest = tenantConnection.model('LeaveRequest', LeaveRequestSchema);

    // Fetch pending leave requests for this manager's team
    const pendingLeaves = await LeaveRequest.find({
      reportingManager: managerEmail,
      status: 'pending'
    }).sort({ appliedOn: -1 });

    console.log(`✅ Found ${pendingLeaves.length} pending leave requests`);

    res.status(200).json({
      success: true,
      count: pendingLeaves.length,
      data: pendingLeaves
    });
  } catch (error) {
    console.error('Error fetching pending leaves:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Approve leave request
// @route   PUT /api/manager/leave/:id/approve
// @access  Private (Manager only)
exports.approveLeave = async (req, res) => {
  let tenantConnection = null;
  
  try {
    const { id } = req.params;
    const { comments } = req.body;
    const managerEmail = req.user.email;
    const managerName = `${req.user.firstName} ${req.user.lastName}`;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID not found'
      });
    }

    // Get tenant connection
    tenantConnection = await getTenantConnection(companyId);
    const LeaveRequest = tenantConnection.model('LeaveRequest', LeaveRequestSchema);

    // Find leave request
    const leaveRequest = await LeaveRequest.findById(id);

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }

    // Verify it's for this manager's team
    if (leaveRequest.reportingManager !== managerEmail) {
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

    // Update leave balance - deduct consumed days
    const LeaveBalance = tenantConnection.model('LeaveBalance', LeaveBalanceSchema);
    const year = new Date(leaveRequest.startDate).getFullYear();
    
    const leaveBalance = await LeaveBalance.findOne({
      employeeEmail: leaveRequest.employeeEmail,
      year: year,
      leaveType: leaveRequest.leaveType
    });

    if (leaveBalance) {
      leaveBalance.consumed += leaveRequest.numberOfDays;
      leaveBalance.available = leaveBalance.total - leaveBalance.consumed;
      await leaveBalance.save();
      console.log(`📊 Updated balance: ${leaveRequest.leaveType} - Consumed: ${leaveBalance.consumed}/${leaveBalance.total}`);
    }

    console.log(`✅ Leave approved: ${id} by ${managerEmail}`);

    res.status(200).json({
      success: true,
      message: 'Leave request approved successfully',
      data: leaveRequest
    });
  } catch (error) {
    console.error('Error approving leave:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Reject leave request
// @route   PUT /api/manager/leave/:id/reject
// @access  Private (Manager only)
exports.rejectLeave = async (req, res) => {
  let tenantConnection = null;
  
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const managerEmail = req.user.email;
    const managerName = `${req.user.firstName} ${req.user.lastName}`;
    const companyId = req.companyId;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID not found'
      });
    }

    // Get tenant connection
    tenantConnection = await getTenantConnection(companyId);
    const LeaveRequest = tenantConnection.model('LeaveRequest', LeaveRequestSchema);

    // Find leave request
    const leaveRequest = await LeaveRequest.findById(id);

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }

    // Verify it's for this manager's team
    if (leaveRequest.reportingManager !== managerEmail) {
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

    console.log(`❌ Leave rejected: ${id} by ${managerEmail}`);

    res.status(200).json({
      success: true,
      message: 'Leave request rejected successfully',
      data: leaveRequest
    });
  } catch (error) {
    console.error('Error rejecting leave:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get manager's assigned projects
// @route   GET /api/manager/projects
// @access  Private (Manager only)
exports.getManagerProjects = async (req, res) => {
  try {
    const managerId = req.user._id || req.user.id;
    const managerEmail = req.user.email;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID not found'
      });
    }

    console.log(`📊 Fetching projects for manager: ${managerEmail}, company: ${companyId}`);

    // Use the same approach as SPC controller - fixed tenant database
    const tenantDbName = 'tenant_696b515db6c9fd5fd51aed1c';
    
    // Get tenant connection directly (same as SPC controller)
    const connection = await getTenantConnection(tenantDbName);
    
    // Use SPC project structure
    const Project = connection.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');

    // Find projects where manager is assigned as manager, HR, or creator (SPC system)
    const managerIdStr = managerId.toString();
    
    try {
      // Debug: Check what we're actually connected to
      console.log('🔍 Database connection debugging...');
      console.log('🔍 tenantDbName:', tenantDbName);
      
      // Check if we can access the database
      const dbStats = await connection.db.stats();
      console.log('🔍 Database stats:', dbStats);
      
      // List all collections
      const collections = await connection.db.listCollections().toArray();
      console.log('🔍 Available collections:', collections.map(c => c.name));
      
      // Check projects collection specifically
      const projectsCount = await Project.countDocuments();
      console.log('🔍 Projects collection count:', projectsCount);
      
      if (projectsCount > 0) {
        console.log('🔍 Examining project structure...');
        const sampleProject = await Project.findOne({});
        console.log('🔍 Sample project structure:', {
          _id: sampleProject._id,
          name: sampleProject.name,
          assignedManagers: sampleProject.assignedManagers,
          assignedHRs: sampleProject.assignedHRs,
          createdBy: sampleProject.createdBy,
          isActive: sampleProject.isActive,
          allFields: Object.keys(sampleProject)
        });
        
        // Check if manager ID matches any field
        console.log('🔍 Checking manager ID match...');
        const managerIdStr = managerId.toString();
        console.log('🔍 Looking for manager ID:', managerIdStr);
        
        // Check each field for the manager ID
        const fieldsToCheck = ['assignedManagers', 'assignedHRs', 'createdBy'];
        for (const field of fieldsToCheck) {
          if (sampleProject[field]) {
            const fieldValues = Array.isArray(sampleProject[field]) ? sampleProject[field] : [sampleProject[field]];
            const hasManager = fieldValues.some(val => 
              val.toString() === managerIdStr || val === managerId
            );
            console.log(`🔍 ${field}:`, sampleProject[field], 'contains manager:', hasManager);
          }
        }
      } else {
        console.log('❌ NO PROJECTS FOUND in this database!');
        console.log('🔍 This is the issue - wrong database or collection');
      }
      
      // Try simpler queries one by one to debug
      console.log('🔍 Testing individual queries...');
      
      // Test 1: Direct ObjectId match (without isActive filter)
      console.log('🔍 Testing Query 1 in detail...');
      console.log('🔍 managerId:', managerId, 'type:', typeof managerId);
      console.log('🔍 managerId.toString():', managerId.toString());
      
      const query1 = { assignedManagers: managerId };
      console.log('🔍 Query 1 object:', query1);
      
      // Try to find all projects first to see their structure
      const allProjects = await Project.find({});
      console.log('🔍 All projects found:', allProjects.length);
      allProjects.forEach((project, index) => {
        console.log(`🔍 Project ${index + 1}:`, {
          name: project.name,
          assignedManagers: project.assignedManagers,
          assignedManagersTypes: project.assignedManagers?.map(id => typeof id),
          assignedManagersStrings: project.assignedManagers?.map(id => id.toString())
        });
      });
      
      const result1 = await Project.find(query1);
      console.log('🔍 Query 1 (ObjectId match):', result1.length, 'projects');
      
      // Test 2: String match (without isActive filter)
      const query2 = { assignedManagers: managerIdStr };
      const result2 = await Project.find(query2);
      console.log('🔍 Query 2 (String match):', result2.length, 'projects');
      
      // Test 3: HR ObjectId match (without isActive filter)
      const query3 = { assignedHRs: managerId };
      const result3 = await Project.find(query3);
      console.log('🔍 Query 3 (HR ObjectId):', result3.length, 'projects');
      
      // Test 4: HR String match (without isActive filter)
      const query4 = { assignedHRs: managerIdStr };
      const result4 = await Project.find(query4);
      console.log('🔍 Query 4 (HR String):', result4.length, 'projects');
      
      // Test 5: createdBy ObjectId match (without isActive filter)
      const query5 = { createdBy: managerId };
      const result5 = await Project.find(query5);
      console.log('🔍 Query 5 (createdBy ObjectId):', result5.length, 'projects');
      
      // Test 6: createdBy String match (without isActive filter)
      const query6 = { createdBy: managerIdStr };
      const result6 = await Project.find(query6);
      console.log('🔍 Query 6 (createdBy String):', result6.length, 'projects');
      
      // Combine all results
      const allResults = [...result1, ...result2, ...result3, ...result4, ...result5, ...result6];
      const uniqueProjects = allResults.filter((project, index, self) => 
        index === self.findIndex(p => p._id.toString() === project._id.toString())
      );
      
      console.log('🔍 Combined unique projects:', uniqueProjects.length);
      
      const projects = uniqueProjects;

      console.log('🔍 Final query completed, found projects:', projects.length);

      console.log('🔍 Found projects for manager:', projects.length);
      projects.forEach(project => {
        console.log('🔍 Project:', project.name, 'assignedManagers:', project.assignedManagers, 'assignedHRs:', project.assignedHRs);
      });

      // Enrich project data with manager's role
      const enrichedProjects = projects.map(project => {
        const managerIdStr = managerId.toString();
        const isAssignedManager = project.assignedManagers && 
          project.assignedManagers.some(id => id.toString() === managerIdStr || id === managerId);
        const isAssignedHR = project.assignedHRs && 
          project.assignedHRs.some(id => id.toString() === managerIdStr || id === managerId);
        const isCreator = project.createdBy && 
          (project.createdBy.toString() === managerIdStr || project.createdBy === managerId);

        return {
          ...project,
          userRole: isAssignedManager ? 'manager' : isAssignedHR ? 'hr' : 'creator',
          canEdit: isAssignedManager || isCreator,
          canViewTeam: true
        };
      });

      res.status(200).json({
        success: true,
        count: enrichedProjects.length,
        data: enrichedProjects
      });
    } catch (queryError) {
      console.error('❌ Database query error:', queryError);
      throw queryError;
    }
  } catch (error) {
    console.error('Error fetching manager projects:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get detailed project information for manager's project
// @route   GET /api/manager/projects/:id
// @access  Private (Manager only)
exports.getManagerProjectDetails = async (req, res) => {
  let tenantConnection = null;

  try {
    const { id } = req.params;
    const managerId = req.user._id || req.user.id;
    const companyId = req.companyId;

    console.log('🔍 Manager Project Details called:', { id, managerId, companyId, user: req.user.email });

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID not found'
      });
    }

    tenantConnection = await getTenantConnection(companyId);
    
    // Use SPC project structure
    const Project = tenantConnection.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
    const TenantUser = tenantConnection.model('User', TenantUserSchema);

    console.log('🔍 Looking for project with ID:', id);

    const project = await Project.findById(id).lean();

    console.log('🔍 Found project:', project);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check if manager has access to this project (SPC system)
    const isAssignedManager = project.assignedManagers && 
      project.assignedManagers.some(managerId => 
        managerId.toString() === managerId.toString()
      );

    const isAssignedHR = project.assignedHRs && 
      project.assignedHRs.some(hrId => 
        hrId.toString() === managerId.toString()
      );

    const isCreator = project.createdBy && 
      project.createdBy.toString() === managerId.toString();

    console.log('🔍 Manager access check:', { 
      isAssignedManager, 
      isAssignedHR, 
      isCreator,
      assignedManagers: project.assignedManagers,
      assignedHRs: project.assignedHRs
    });

    if (!isAssignedManager && !isAssignedHR && !isCreator) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this project'
      });
    }

    // Return the project data directly for SPC system
    res.status(200).json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('Error fetching manager project details:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  } finally {
    if (tenantConnection) {
      await tenantConnection.close();
    }
  }
};

// @desc    Assign project to manager
// @route   POST /api/manager/projects
// @access  Private (Manager only)
exports.assignProject = async (req, res) => {
  let tenantConnection = null;
  
  try {
    const { projectId, role } = req.body;
    const managerId = req.user._id || req.user.id;
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID not found'
      });
    }

    tenantConnection = await getTenantConnection(companyId);
    
    // Use SPC project structure
    const Project = tenantConnection.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Add manager to assignedManagers or assignedHRs based on role
    if (role === 'manager') {
      if (!project.assignedManagers) project.assignedManagers = [];
      if (!project.assignedManagers.includes(managerId)) {
        project.assignedManagers.push(managerId);
      }
    } else if (role === 'hr') {
      if (!project.assignedHRs) project.assignedHRs = [];
      if (!project.assignedHRs.includes(managerId)) {
        project.assignedHRs.push(managerId);
      }
    }

    await project.save();

    res.status(200).json({
      success: true,
      message: 'Successfully assigned to project',
      data: project
    });
  } catch (error) {
    console.error('Error assigning project:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  } finally {
    if (tenantConnection) {
      await tenantConnection.close();
    }
  }
};
