const mongoose = require('mongoose');
const { SPC_ROLES, PROJECT_PERMISSIONS, hasSPCPermission, getUserProjects, canAccessProject, getUserTeamMembers, canPerformProjectAction } = require('../config/spcProjectPermissions');
const { getTenantConnection } = require('../config/database.config');

/**
 * SPC Project Controller - Fixed Version
 */

class SPCProjectController {
  /**
   * Get user's dashboard data based on their project assignments
   */
  static async getUserDashboard(req, res) {
    console.log('🚀 SPC getUserDashboard METHOD CALLED!!!');
    try {
      console.log('🔍 getUserDashboard called');
      console.log('🔍 req.user exists:', !!req.user);
      
      if (!req.user) {
        console.error('❌ No req.user found - authentication failed');
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      console.log('🔍 req.user:', JSON.stringify(req.user, null, 2));
      
      const user = req.user;
      const userId = user._id || user.id;
      let userRole = user.role;
      
      console.log('🔍 Extracted user info:', { userId, userRole });
      
      // For SPC system, use the fixed tenant database
      const tenantDbName = 'tenant_696b515db6c9fd5fd51aed1c';
      
      console.log('🔍 Debug - Dashboard User data:', { userId, userRole, tenantDbName });
      
      // Get tenant connection directly
      console.log('🔍 About to call getTenantConnection...');
      const connection = await getTenantConnection(tenantDbName);
      console.log('🔍 Connection established');
      
      // Get user's assigned projects
      console.log('🔍 About to get projects for userRole:', userRole);
      let userProjects;
      
      // Admin sees all projects (both 'admin' and 'company_admin')
      if (userRole === 'company_admin' || userRole === 'admin') {
        // Admin sees all projects
        console.log('🔍 Admin user - fetching all projects');
        try {
          const Project = connection.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
          userProjects = await Project.find({})
            .sort({ createdAt: -1 });
          console.log('🔍 Admin query completed, found:', userProjects.length);
        } catch (projectError) {
          console.error('❌ Error in admin project query:', projectError);
          userProjects = [];
        }
      } else {
        // Other users see only assigned projects
        console.log('🔍 Non-admin user - fetching assigned projects');
        try {
          userProjects = await getUserProjects(userId, connection);
          console.log('🔍 Assigned projects query completed, found:', userProjects.length);
        } catch (assignedError) {
          console.error('❌ Error in assigned projects query:', assignedError);
          userProjects = [];
        }
      }
      
      console.log('🔍 Final userProjects count:', userProjects.length);
      console.log('🔍 User projects data:', JSON.stringify(userProjects, null, 2));
      
      // If no projects found, return empty response with success
      if (!userProjects || userProjects.length === 0) {
        console.log('🔍 No projects found, returning empty response');
        return res.json({
          success: true,
          data: {
            projects: [],
            teamMembers: [],
            stats: {
              totalProjects: 0,
              activeProjects: 0,
              teamMembers: 0
            }
          }
        });
      }
      
      // Get team members for each project
      const dashboardData = {
        projects: userProjects.map(project => ({
          id: project._id,
          name: project.name,
          status: project.status,
          priority: project.priority,
          startDate: project.startDate,
          endDate: project.endDate,
          description: project.description
        })),
        teamMembers: [],
        stats: {
          totalProjects: userProjects.length,
          activeProjects: userProjects.filter(p => p.status === 'active').length,
          teamMembers: 0
        }
      };
      
      console.log('🔍 Dashboard data created:', JSON.stringify(dashboardData, null, 2));
      console.log('🔍 About to send response...');
      
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

  /**
   * Get all projects for the current user
   */
  static async getProjects(req, res) {
    try {
      const user = req.user;
      const userId = user._id || user.id;
      let userRole = user.role;
      
      // Map role names to SPC role format
      if (userRole === 'admin') {
        userRole = 'company_admin';
      }
      
      // For SPC system, use the fixed tenant database
      const tenantDbName = 'tenant_696b515db6c9fd5fd51aed1c';
      
      console.log('🔍 Debug - Projects User data:', { userId, userRole, tenantDbName });
      
      // Get tenant connection directly
      const connection = await getTenantConnection(tenantDbName);
      
      const Project = connection.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
      
      let projects;
      
      if (userRole === SPC_ROLES.COMPANY_ADMIN) {
        // Admin sees all projects
        projects = await Project.find({});
      } else {
        // Others see only assigned projects
        const userProjects = await getUserProjects(userId, connection);
        const userProjectIds = userProjects.map(p => p._id);
        
        projects = await Project.find({ _id: { $in: userProjectIds } });
      }

      res.json({
        success: true,
        data: projects
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
      console.log('🔍 createProject (Fixed) - req.user:', JSON.stringify(req.user, null, 2));
      const user = req.user;
      const userId = user._id || user.id;
      let userRole = user.role;
      
      console.log('🔍 createProject (Fixed) - extracted:', { userId, userRole });
      
      // Map role names to SPC role format
      if (userRole === 'admin') {
        userRole = 'company_admin';
      }
      
      console.log('🔍 createProject (Fixed) - after mapping:', { userId, userRole });
      
      // For SPC system, use the fixed tenant database
      const tenantDbName = 'tenant_696b515db6c9fd5fd51aed1c';
      
      // Check permission
      console.log('🔐 SPC Permission Check:');
      console.log('   Required permission: project_create');
      console.log('   User role:', userRole);
      console.log('   User email:', user.email);
      
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

      // Create project assignments for assigned HRs
      if (projectData.assignedHRs && projectData.assignedHRs.length > 0) {
        console.log('🔍 Creating project assignments for HRs...');
        const ProjectAssignment = connection.model('ProjectAssignment', new mongoose.Schema({}, { strict: false }), 'projectassignments');
        
        for (const hrId of projectData.assignedHRs) {
          const assignment = new ProjectAssignment({
            projectId: project._id,
            userId: hrId,
            role: 'hr',
            isActive: true,
            assignedAt: new Date(),
            assignedBy: userId
          });
          await assignment.save();
          console.log(`✅ Created HR assignment: ${hrId} -> ${project._id}`);
        }
      }

      res.status(201).json({
        success: true,
        data: project,
        message: 'Project created successfully'
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
   * Get project details by ID
   */
  static async getProjectDetails(req, res) {
    try {
      const user = req.user;
      const userId = user._id || user.id;
      let userRole = user.role;
      
      // Map role names to SPC role format
      if (userRole === 'admin') {
        userRole = 'company_admin';
      }
      const { projectId } = req.params;
      
      // For SPC system, use the fixed tenant database
      const tenantDbName = 'tenant_696b515db6c9fd5fd51aed1c';
      
      // Get tenant connection directly
      const connection = await getTenantConnection(tenantDbName);
      
      // Check if user can access this project
      const canAccess = await canAccessProject(userId, projectId, userRole, connection);
      if (!canAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this project'
        });
      }
      
      const Project = connection.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
      
      const project = await Project.findById(projectId);
      
      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }

      res.json({
        success: true,
        data: project
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
      const user = req.user;
      const userId = user._id || user.id;
      let userRole = user.role;
      
      // Map role names to SPC role format
      if (userRole === 'admin') {
        userRole = 'company_admin';
      }
      const { projectId } = req.params;
      const updateData = req.body;
      
      console.log('🔍 Backend: Update project request:', { projectId, updateData, userRole });
      
      // For SPC system, use the fixed tenant database
      const tenantDbName = 'tenant_696b515db6c9fd5fd51aed1c';
      
      // Get tenant connection directly
      const connection = await getTenantConnection(tenantDbName);
      
      // Check permission
      const canPerform = await canPerformProjectAction(userId, userRole, PROJECT_PERMISSIONS.PROJECT_EDIT, projectId, 'project', connection);
      if (!canPerform) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to update this project'
        });
      }
      
      const Project = connection.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
      
      const project = await Project.findByIdAndUpdate(
        projectId,
        {
          ...updateData,
          updatedAt: new Date()
        },
        { new: true, runValidators: true }
      );
      
      console.log('🔍 Backend: Updated project:', project);
      
      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }

      res.json({
        success: true,
        data: project,
        message: 'Project updated successfully'
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
      const user = req.user;
      const userId = user._id || user.id;
      let userRole = user.role;
      
      // Map role names to SPC role format
      if (userRole === 'admin') {
        userRole = 'company_admin';
      }
      const { projectId } = req.params;
      const { assignedManagers, assignedHRs } = req.body;
      
      console.log('🔍 Backend: Assign users request:', { projectId, assignedManagers, assignedHRs });
      
      // For SPC system, use the fixed tenant database
      const tenantDbName = 'tenant_696b515db6c9fd5fd51aed1c';
      
      // Check permission
      if (!hasSPCPermission(userRole, PROJECT_PERMISSIONS.USER_ASSIGN_PROJECT)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to assign users to projects'
        });
      }
      
      // Get tenant connection directly
      const connection = await getTenantConnection(tenantDbName);
      
      const Project = connection.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
      
      const project = await Project.findByIdAndUpdate(
        projectId,
        {
          assignedManagers: assignedManagers || [],
          assignedHRs: assignedHRs || [],
          updatedAt: new Date()
        },
        { new: true, runValidators: true }
      );
      
      console.log('🔍 Backend: Updated project:', project);
      
      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }

      res.json({
        success: true,
        data: project,
        message: 'Users assigned to project successfully'
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
   * Create team assignments
   */
  static async createTeamAssignments(req, res) {
    try {
      const user = req.user;
      const userId = user._id || user.id;
      let userRole = user.role;
      
      // Map role names to SPC role format
      if (userRole === 'admin') {
        userRole = 'company_admin';
      }
      const { projectId } = req.params;
      const { teamMembers } = req.body;
      
      // For SPC system, use the fixed tenant database
      const tenantDbName = 'tenant_696b515db6c9fd5fd51aed1c';
      
      // Get tenant connection directly
      const connection = await getTenantConnection(tenantDbName);
      
      // Check permission
      const canPerform = await canPerformProjectAction(userId, userRole, PROJECT_PERMISSIONS.TEAM_MANAGE, projectId, 'team', connection);
      if (!canPerform) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to manage team for this project'
        });
      }
      
      const Project = connection.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
      
      const project = await Project.findByIdAndUpdate(
        projectId,
        {
          teamMembers: teamMembers || [],
          updatedAt: new Date()
        },
        { new: true, runValidators: true }
      );
      
      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }

      res.json({
        success: true,
        data: project,
        message: 'Team assignments created successfully'
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
}

module.exports = SPCProjectController;
