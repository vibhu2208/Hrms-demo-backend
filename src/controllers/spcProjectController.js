const mongoose = require('mongoose');
const { SPC_ROLES, PROJECT_PERMISSIONS, hasSPCPermission, getUserProjects, canAccessProject, getUserTeamMembers, canPerformProjectAction } = require('../config/spcProjectPermissions');
const { getTenantConnection } = require('../config/database.config');

/**
 * SPC Project Controller
 * Handles all project-related operations with project-based access control
 */

class SPCProjectController {
  /**
   * Get all projects for the current user
   * Admin sees all projects, others see only assigned projects
   */
  static async getProjects(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const userRole = req.user.role;
      
      // For SPC system, use the fixed tenant database
      const tenantDbName = 'tenant_696b515db6c9fd5fd51aed1c';
      
      console.log('🔍 Debug - Projects User data:', { userId, userRole, tenantDbName });
      
      // Get tenant connection directly
      const connection = await getTenantConnection(tenantDbName);
      
      const Project = connection.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
      
      let projects;
      
      // Admin sees all projects (both 'admin' and 'company_admin')
      if (userRole === SPC_ROLES.COMPANY_ADMIN || userRole === 'admin') {
        // Admin sees all projects
        projects = await Project.find({})
          .populate('assignedManagers', 'email firstName lastName')
          .populate('assignedHRs', 'email firstName lastName')
          .sort({ createdAt: -1 });
      } else {
        // Others see only assigned projects
        const userProjectIds = await getUserProjects(userId, connection);
        projects = await Project.find({ 
          _id: { $in: userProjectIds.map(p => p._id) }
        })
          .populate('assignedManagers', 'email firstName lastName')
          .populate('assignedHRs', 'email firstName lastName')
          .sort({ createdAt: -1 });
      }

      res.json({
        success: true,
        data: projects,
        count: projects.length
      });

    } catch (error) {
      console.error('Error getting projects:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve projects',
        error: error.message
      });
    }
  }

  /**
   * Create a new project (Admin only)
   */
  static async createProject(req, res) {
    try {
      console.log('🔍 createProject - req.user:', JSON.stringify(req.user, null, 2));
      const userId = req.user._id || req.user.id;
      const userRole = req.user.role;
      
      console.log('🔍 createProject - extracted:', { userId, userRole });
      
      // For SPC system, use the fixed tenant database
      const tenantDbName = 'tenant_696b515db6c9fd5fd51aed1c';
      
      // Check permission
      console.log('🔐 SPC Permission Check:');
      console.log('   Required permission: project_create');
      console.log('   User role:', userRole);
      console.log('   User email:', req.user.email);
      
      if (!hasSPCPermission(userRole, PROJECT_PERMISSIONS.PROJECT_CREATE)) {
        console.log('❌ Permission denied for role:', userRole, 'permission: project_create');
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to create projects'
        });
      }

      const projectData = req.body;
      
      // Get tenant connection directly
      const connection = await getTenantConnection(tenantDbName);
      
      const Project = connection.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
      
      // If project is created from a contract, use contract dates as timeline
      if (projectData.contractId) {
        const Contract = connection.model('Contract', new mongoose.Schema({}, { strict: false }), 'contracts');
        const contract = await Contract.findById(projectData.contractId);
        
        if (contract) {
          // Use contract dates if project dates are not explicitly provided
          projectData.startDate = projectData.startDate || contract.startDate;
          projectData.endDate = projectData.endDate || contract.endDate;
        }
      }
      
      // If project is created from a job posting, use job posting dates as timeline
      if (projectData.jobPostingId) {
        const JobPosting = connection.model('JobPosting', new mongoose.Schema({}, { strict: false }), 'jobpostings');
        const jobPosting = await JobPosting.findById(projectData.jobPostingId);
        
        if (jobPosting) {
          // Use job posting dates if project dates are not explicitly provided
          projectData.startDate = projectData.startDate || jobPosting.startDate;
          projectData.endDate = projectData.endDate || jobPosting.endDate;
        }
      }
      
      // Generate unique project code
      const projectCode = `PROJ${Date.now()}`;
      
      const project = new Project({
        ...projectData,
        projectCode,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await project.save();

      // If managers/HRs are specified, create assignments
      const ProjectAssignment = connection.model('ProjectAssignment', new mongoose.Schema({}, { strict: false }), 'projectassignments');
      
      if (projectData.assignedManagers && projectData.assignedManagers.length > 0) {
        for (const managerId of projectData.assignedManagers) {
          const assignment = new ProjectAssignment({
            projectId: project._id,
            userId: managerId,
            role: 'manager',
            assignedBy: userId,
            permissions: ['view_project', 'edit_project', 'assign_team', 'view_team', 'manage_tasks', 'view_reports']
          });
          await assignment.save();
        }
      }

      if (projectData.assignedHRs && projectData.assignedHRs.length > 0) {
        for (const hrId of projectData.assignedHRs) {
          const assignment = new ProjectAssignment({
            projectId: project._id,
            userId: hrId,
            role: 'hr',
            assignedBy: userId,
            permissions: ['view_project', 'view_team', 'manage_tasks']
          });
          await assignment.save();
        }
      }

      res.status(201).json({
        success: true,
        message: 'Project created successfully',
        data: project
      });

    } catch (error) {
      console.error('Error creating project:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create project',
        error: error.message
      });
    }
  }

  /**
   * Get project details with team information
   */
  static async getProjectDetails(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const userRole = req.user.role;
      const { projectId } = req.params;
      
      // For SPC system, use the fixed tenant database
      const tenantDbName = 'tenant_696b515db6c9fd5fd51aed1c';
      
      // Get tenant connection directly
      const connection = await getTenantConnection(tenantDbName);
      
      // Check project access
      const canAccess = await canAccessProject(userId, projectId, userRole, connection);
      if (!canAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this project'
        });
      }

      const Project = connection.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
      
      const project = await Project.findById(projectId)
        .populate('assignedManagers', 'email firstName lastName')
        .populate('assignedHRs', 'email firstName lastName');

      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }

      // Get team assignments for this project
      const TeamAssignment = connection.model('TeamAssignment', new mongoose.Schema({}, { strict: false }), 'teamassignments');
      const teamAssignments = await TeamAssignment.find({ 
        projectId: projectId,
        isActive: true 
      })
        .populate('managerId', 'email firstName lastName')
        .populate('hrId', 'email firstName lastName');

      // Get user's team members
      const userTeamMembers = await getUserTeamMembers(userId, userRole, projectId, connection);

      res.json({
        success: true,
        data: {
          project,
          teamAssignments,
          userTeamMembers
        }
      });

    } catch (error) {
      console.error('Error getting project details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve project details',
        error: error.message
      });
    }
  }

  /**
   * Update project (Admin and assigned managers only)
   */
  static async updateProject(req, res) {
    try {
      const { userId, userRole } = req.user;
      const { projectId } = req.params;
      const updateData = req.body;
      
      // For SPC system, use the fixed tenant database
      const tenantDbName = 'tenant_696b515db6c9fd5fd51aed1c';
      
      // Get tenant connection directly
      const connection = await getTenantConnection(tenantDbName);
      
      // Check permission and access
      const canPerform = await canPerformProjectAction(userId, userRole, PROJECT_PERMISSIONS.PROJECT_EDIT, projectId, null, connection);
      if (!canPerform) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to edit this project'
        });
      }

      const Project = connection.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
      
      const project = await Project.findByIdAndUpdate(
        projectId,
        {
          ...updateData,
          updatedAt: new Date()
        },
        { new: true }
      ).populate('assignedManagers', 'email firstName lastName')
       .populate('assignedHRs', 'email firstName lastName');

      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }

      res.json({
        success: true,
        message: 'Project updated successfully',
        data: project
      });

    } catch (error) {
      console.error('Error updating project:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update project',
        error: error.message
      });
    }
  }

  /**
   * Assign users to project (Admin only)
   */
  static async assignUsersToProject(req, res) {
    try {
      const { userId, userRole } = req.user;
      const { projectId } = req.params;
      const { managers, hrs, employees } = req.body;
      
      // Check permission
      if (!hasSPCPermission(userRole, PROJECT_PERMISSIONS.USER_ASSIGN_PROJECT)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to assign users to projects'
        });
      }

      // Get tenant connection directly
      const tenantDbName = 'tenant_696b515db6c9fd5fd51aed1c';
      const connection = await getTenantConnection(tenantDbName);
      
      const ProjectAssignment = connection.model('ProjectAssignment', new mongoose.Schema({}, { strict: false }), 'projectassignments');
      
      // Clear existing assignments for this project
      await ProjectAssignment.deleteMany({ projectId });

      // Create new assignments
      const assignments = [];

      // Assign managers
      if (managers && managers.length > 0) {
        for (const managerId of managers) {
          const assignment = new ProjectAssignment({
            projectId,
            userId: managerId,
            role: 'manager',
            assignedBy: userId,
            permissions: ['view_project', 'edit_project', 'assign_team', 'view_team', 'manage_tasks', 'view_reports']
          });
          assignments.push(assignment);
        }
      }

      // Assign HRs
      if (hrs && hrs.length > 0) {
        for (const hrId of hrs) {
          const assignment = new ProjectAssignment({
            projectId,
            userId: hrId,
            role: 'hr',
            assignedBy: userId,
            permissions: ['view_project', 'view_team', 'manage_tasks']
          });
          assignments.push(assignment);
        }
      }

      // Assign employees
      if (employees && employees.length > 0) {
        for (const employeeId of employees) {
          const assignment = new ProjectAssignment({
            projectId,
            userId: employeeId,
            role: 'employee',
            assignedBy: userId,
            permissions: ['view_project']
          });
          assignments.push(assignment);
        }
      }

      // Save all assignments
      await ProjectAssignment.insertMany(assignments);

      res.json({
        success: true,
        message: 'Users assigned to project successfully',
        data: {
          assignmentsCreated: assignments.length
        }
      });

    } catch (error) {
      console.error('Error assigning users to project:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to assign users to project',
        error: error.message
      });
    }
  }

  /**
   * Create team assignments (Manager-HR relationships)
   */
  static async createTeamAssignments(req, res) {
    try {
      const { userId, userRole } = req.user;
      const { projectId } = req.params;
      const { teamAssignments } = req.body; // Array of {managerId, hrId, relationshipType}
      
      // Get tenant connection directly
      const tenantDbName = 'tenant_696b515db6c9fd5fd51aed1c';
      const connection = await getTenantConnection(tenantDbName);
      
      // Check permission
      const canPerform = await canPerformProjectAction(userId, userRole, PROJECT_PERMISSIONS.TEAM_MANAGE, projectId, null, connection);
      if (!canPerform) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to manage team assignments'
        });
      }

      const TeamAssignment = connection.model('TeamAssignment', new mongoose.Schema({}, { strict: false }), 'teamassignments');
      
      // Clear existing team assignments for this project
      await TeamAssignment.deleteMany({ projectId });

      // Create new team assignments
      const assignments = teamAssignments.map(({ managerId, hrId, relationshipType, notes }) => ({
        projectId,
        managerId,
        hrId,
        relationshipType: relationshipType || 'project_hr',
        assignedBy: userId,
        notes: notes || '',
        isActive: true,
        assignedAt: new Date()
      }));

      await TeamAssignment.insertMany(assignments);

      res.json({
        success: true,
        message: 'Team assignments created successfully',
        data: {
          assignmentsCreated: assignments.length
        }
      });

    } catch (error) {
      console.error('Error creating team assignments:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create team assignments',
        error: error.message
      });
    }
  }

  /**
   * Get user's dashboard data based on their project assignments
   */
  static async getUserDashboard(req, res) {
    try {
      console.log('🔍 getUserDashboard called');
      console.log('🔍 req.user:', JSON.stringify(req.user, null, 2));
      
      const { userId, userRole } = req.user;
      
      // For SPC system, use the fixed tenant database
      const tenantDbName = 'tenant_696b515db6c9fd5fd51aed1c';
      
      console.log('🔍 Debug - Dashboard User data:', { userId, userRole, tenantDbName });
      
      // Get tenant connection directly
      console.log('🔍 About to call getTenantConnection...');
      const connection = await getTenantConnection(tenantDbName);
      console.log('🔍 Connection established');
      
      // Get user's assigned projects
      console.log('🔍 About to call getUserProjects...');
      const userProjects = await getUserProjects(userId, connection);
      console.log('🔍 User projects retrieved:', userProjects.length);
      
      // Get detailed project information with populated managers
      const projectsWithManagers = await connection.model('Project', new mongoose.Schema({}, { strict: false }), 'projects')
        .find({ _id: { $in: userProjects.map(p => p._id) } })
        .populate('assignedManagers', 'firstName lastName email phone department')
        .populate('assignedHRs', 'firstName lastName email phone department')
        .populate('assignedEmployees', 'firstName lastName email phone department');
      
      // Get team members for each project
      const dashboardData = {
        projects: projectsWithManagers.map(project => ({
          id: project._id,
          name: project.name,
          status: project.status,
          priority: project.priority,
          startDate: project.startDate,
          endDate: project.endDate,
          description: project.description,
          assignedManagers: project.assignedManagers || [],
          assignedHRs: project.assignedHRs || [],
          assignedEmployees: project.assignedEmployees || []
        })),
        teamMembers: [],
        stats: {
          totalProjects: userProjects.length,
          activeProjects: userProjects.filter(p => p.status === 'active').length,
          teamMembers: 0
        }
      };
      
      console.log('🔍 Dashboard data created, about to send response...');
      
      res.json({
        success: true,
        data: dashboardData
      });
      
      console.log('✅ Response sent successfully');
      
    } catch (error) {
      console.error('❌ Error in getUserDashboard:', error.message);
      console.error('❌ Stack trace:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve dashboard data',
        error: error.message
      });
    }
  }
}

module.exports = SPCProjectController;
