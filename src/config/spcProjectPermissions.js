/**
 * SPC Project-Based Permission System
 * Replaces department-based permissions with project-based access control
 */

const mongoose = require('mongoose');

// Simplified SPC Role Definitions
const SPC_ROLES = {
  COMPANY_ADMIN: 'company_admin',
  MANAGER: 'manager', 
  HR: 'hr',
  EMPLOYEE: 'employee'
};

// Project-Based Permissions
const PROJECT_PERMISSIONS = {
  // Project Management
  PROJECT_CREATE: 'project_create',
  PROJECT_VIEW_ALL: 'project_view_all',
  PROJECT_VIEW_ASSIGNED: 'project_view_assigned',
  PROJECT_EDIT: 'project_edit',
  PROJECT_DELETE: 'project_delete',
  
  // Team Management
  TEAM_ASSIGN_MANAGER: 'team_assign_manager',
  TEAM_ASSIGN_HR: 'team_assign_hr',
  TEAM_VIEW_ASSIGNED: 'team_view_assigned',
  TEAM_MANAGE: 'team_manage',
  
  // Data Access
  DATA_VIEW_PROJECT: 'data_view_project',
  DATA_VIEW_TEAM: 'data_view_team',
  DATA_EDIT_PROJECT: 'data_edit_project',
  
  // User Management
  USER_CREATE: 'user_create',
  USER_ASSIGN_PROJECT: 'user_assign_project',
  USER_VIEW_TEAM: 'user_view_team',
  
  // Reports
  REPORTS_VIEW_PROJECT: 'reports_view_project',
  REPORTS_VIEW_ALL: 'reports_view_all',
  REPORTS_EXPORT: 'reports_export'
};

// Permission Matrix for SPC Roles
const SPC_PERMISSION_MATRIX = {
  [SPC_ROLES.COMPANY_ADMIN]: [
    // Full project control
    PROJECT_PERMISSIONS.PROJECT_CREATE,
    PROJECT_PERMISSIONS.PROJECT_VIEW_ALL,
    PROJECT_PERMISSIONS.PROJECT_EDIT,
    PROJECT_PERMISSIONS.PROJECT_DELETE,
    
    // Full team control
    PROJECT_PERMISSIONS.TEAM_ASSIGN_MANAGER,
    PROJECT_PERMISSIONS.TEAM_ASSIGN_HR,
    PROJECT_PERMISSIONS.TEAM_VIEW_ASSIGNED,
    PROJECT_PERMISSIONS.TEAM_MANAGE,
    
    // Full data access
    PROJECT_PERMISSIONS.DATA_VIEW_PROJECT,
    PROJECT_PERMISSIONS.DATA_VIEW_TEAM,
    PROJECT_PERMISSIONS.DATA_EDIT_PROJECT,
    
    // Full user management
    PROJECT_PERMISSIONS.USER_CREATE,
    PROJECT_PERMISSIONS.USER_ASSIGN_PROJECT,
    PROJECT_PERMISSIONS.USER_VIEW_TEAM,
    
    // Full reports
    PROJECT_PERMISSIONS.REPORTS_VIEW_PROJECT,
    PROJECT_PERMISSIONS.REPORTS_VIEW_ALL,
    PROJECT_PERMISSIONS.REPORTS_EXPORT
  ],

  // 'admin' role has same permissions as 'company_admin'
  'admin': [
    // Full project control
    PROJECT_PERMISSIONS.PROJECT_CREATE,
    PROJECT_PERMISSIONS.PROJECT_VIEW_ALL,
    PROJECT_PERMISSIONS.PROJECT_EDIT,
    PROJECT_PERMISSIONS.PROJECT_DELETE,
    
    // Full team control
    PROJECT_PERMISSIONS.TEAM_ASSIGN_MANAGER,
    PROJECT_PERMISSIONS.TEAM_ASSIGN_HR,
    PROJECT_PERMISSIONS.TEAM_VIEW_ASSIGNED,
    PROJECT_PERMISSIONS.TEAM_MANAGE,
    
    // Full data access
    PROJECT_PERMISSIONS.DATA_VIEW_PROJECT,
    PROJECT_PERMISSIONS.DATA_VIEW_TEAM,
    PROJECT_PERMISSIONS.DATA_EDIT_PROJECT,
    
    // Full user management
    PROJECT_PERMISSIONS.USER_CREATE,
    PROJECT_PERMISSIONS.USER_ASSIGN_PROJECT,
    PROJECT_PERMISSIONS.USER_VIEW_TEAM,
    
    // Full reports
    PROJECT_PERMISSIONS.REPORTS_VIEW_PROJECT,
    PROJECT_PERMISSIONS.REPORTS_VIEW_ALL,
    PROJECT_PERMISSIONS.REPORTS_EXPORT
  ],

  [SPC_ROLES.MANAGER]: [
    // Limited project control (assigned projects only)
    PROJECT_PERMISSIONS.PROJECT_VIEW_ASSIGNED,
    PROJECT_PERMISSIONS.PROJECT_EDIT,
    
    // Team management for assigned projects
    PROJECT_PERMISSIONS.TEAM_VIEW_ASSIGNED,
    PROJECT_PERMISSIONS.TEAM_MANAGE,
    
    // Data access for assigned projects
    PROJECT_PERMISSIONS.DATA_VIEW_PROJECT,
    PROJECT_PERMISSIONS.DATA_VIEW_TEAM,
    PROJECT_PERMISSIONS.DATA_EDIT_PROJECT,
    
    // User management for team
    PROJECT_PERMISSIONS.USER_VIEW_TEAM,
    
    // Reports for assigned projects
    PROJECT_PERMISSIONS.REPORTS_VIEW_PROJECT,
    PROJECT_PERMISSIONS.REPORTS_EXPORT
  ],

  [SPC_ROLES.HR]: [
    // Project view for assigned projects
    PROJECT_PERMISSIONS.PROJECT_VIEW_ASSIGNED,
    
    // Team view for assigned projects
    PROJECT_PERMISSIONS.TEAM_VIEW_ASSIGNED,
    
    // Data access for assigned projects
    PROJECT_PERMISSIONS.DATA_VIEW_PROJECT,
    PROJECT_PERMISSIONS.DATA_VIEW_TEAM,
    
    // User view for team members
    PROJECT_PERMISSIONS.USER_VIEW_TEAM,
    
    // Reports for assigned projects
    PROJECT_PERMISSIONS.REPORTS_VIEW_PROJECT
  ],

  [SPC_ROLES.EMPLOYEE]: [
    // Limited project view (own assignments)
    PROJECT_PERMISSIONS.PROJECT_VIEW_ASSIGNED,
    
    // Limited data access (own data)
    PROJECT_PERMISSIONS.DATA_VIEW_PROJECT
  ]
};

// Role Hierarchy
const SPC_ROLE_HIERARCHY = {
  [SPC_ROLES.COMPANY_ADMIN]: 1,
  [SPC_ROLES.MANAGER]: 2,
  [SPC_ROLES.HR]: 3,
  [SPC_ROLES.EMPLOYEE]: 4
};

/**
 * Check if user has specific permission
 */
function hasSPCPermission(userRole, permission) {
  const rolePermissions = SPC_PERMISSION_MATRIX[userRole] || [];
  return rolePermissions.includes(permission);
}

/**
 * Get user's assigned projects
 */
async function getUserProjects(userId, connection) {
  try {
    console.log('🔍 getUserProjects called for userId:', userId);
    
    // First try to get from projectassignments collection
    try {
      console.log('🔍 Trying projectassignments collection...');
      const ProjectAssignment = connection.model('ProjectAssignment', new mongoose.Schema({}, { strict: false }), 'projectassignments');
      const assignments = await ProjectAssignment.find({ 
        userId: userId, 
        isActive: true 
      }).populate('projectId');
      
      console.log('🔍 Found assignments:', assignments.length);
      if (assignments.length > 0) {
        const projects = assignments.map(assignment => assignment.projectId);
        console.log('🔍 Returning projects from assignments:', projects.length);
        return projects;
      }
    } catch (assignmentError) {
      console.log('⚠️ projectassignments collection not found, trying projects collection');
      console.log('⚠️ Error:', assignmentError.message);
    }
    
    // Fallback: Check projects collection for assigned managers/HRs
    console.log('🔍 Trying projects collection fallback...');
    const Project = connection.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
    const projects = await Project.find({
      $or: [
        { assignedManagers: { $in: [userId.toString()] } },
        { assignedHRs: { $in: [userId.toString()] } },
        { createdBy: userId.toString() }
      ]
    });
    
    console.log('🔍 Found projects in fallback:', projects.length);
    console.log('🔍 Projects data:', JSON.stringify(projects, null, 2));
    
    return projects;
  } catch (error) {
    console.error('Error getting user projects:', error);
    return [];
  }
}

/**
 * Check if user can access specific project
 */
async function canAccessProject(userId, projectId, userRole, connection) {
  try {
    console.log(`🔍 canAccessProject called with: userId=${userId}, projectId=${projectId}, userRole=${userRole}`);
    
    // Admin can access all projects (both 'admin' and 'company_admin')
    if (userRole === SPC_ROLES.COMPANY_ADMIN || userRole === 'admin') {
      console.log('✅ Admin access granted');
      return true;
    }

    // First try projectassignments collection
    try {
      const ProjectAssignment = connection.model('ProjectAssignment', new mongoose.Schema({}, { strict: false }), 'projectassignments');
      const assignment = await ProjectAssignment.findOne({
        userId: userId,
        projectId: projectId,
        isActive: true
      });

      if (assignment) {
        return true;
      }
    } catch (assignmentError) {
      console.log('⚠️ projectassignments collection not found, checking projects collection');
    }
    
    // Fallback: Check projects collection directly
    const Project = connection.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
    const project = await Project.findById(projectId);
    
    if (!project) {
      return false;
    }
    
    // Check if user is assigned as manager, HR, or creator
    const isManager = project.assignedManagers && project.assignedManagers.some(id => id.toString() === userId.toString());
    const isHR = project.assignedHRs && project.assignedHRs.some(id => id.toString() === userId.toString());
    const isCreator = project.createdBy && project.createdBy.toString() === userId.toString();
    
    return isManager || isHR || isCreator;
    
  } catch (error) {
    console.error('Error checking project access:', error);
    return false;
  }
}

/**
 * Get user's team members (managers see their HRs, HRs see their managers)
 */
async function getUserTeamMembers(userId, userRole, projectId, connection) {
  try {
    // First try teamassignments collection
    try {
      const TeamAssignment = connection.model('TeamAssignment', new mongoose.Schema({}, { strict: false }), 'teamassignments');
      
      if (userRole === SPC_ROLES.MANAGER) {
        // Manager gets their assigned HRs
        const assignments = await TeamAssignment.find({
          managerId: userId,
          projectId: projectId,
          isActive: true
        }).populate('hrId');
        
        return assignments.map(assignment => assignment.hrId);
      } else if (userRole === SPC_ROLES.HR) {
        // HR gets their assigned managers
        const assignments = await TeamAssignment.find({
          hrId: userId,
          projectId: projectId,
          isActive: true
        }).populate('managerId');
        
        return assignments.map(assignment => assignment.managerId);
      }
    } catch (teamError) {
      console.log('⚠️ teamassignments collection not found, using project assignments');
    }
    
    // Fallback: Use project assignments to determine team members
    const Project = connection.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
    const project = await Project.findById(projectId).populate('assignedManagers assignedHRs');
    
    if (!project) {
      return [];
    }
    
    if (userRole === SPC_ROLES.MANAGER) {
      // Manager sees assigned HRs
      return project.assignedHRs || [];
    } else if (userRole === SPC_ROLES.HR) {
      // HR sees assigned managers
      return project.assignedManagers || [];
    }
    
    return [];
  } catch (error) {
    console.error('Error getting user team members:', error);
    return [];
  }
}

/**
 * Filter data based on user's project assignments
 */
async function filterDataByProjectAccess(userId, userRole, data, connection) {
  try {
    // Admin sees all data
    if (userRole === SPC_ROLES.COMPANY_ADMIN) {
      return data;
    }

    // Get user's assigned projects
    const userProjects = await getUserProjects(userId, connection);
    const userProjectIds = userProjects.map(p => p._id.toString());

    // Filter data based on project field
    if (Array.isArray(data)) {
      return data.filter(item => {
        if (item.projectId) {
          return userProjectIds.includes(item.projectId.toString());
        }
        // If no projectId field, include only if user has access to all projects
        return false;
      });
    }

    return data;
  } catch (error) {
    console.error('Error filtering data:', error);
    return [];
  }
}

/**
 * Check if user can perform action on project-specific resource
 */
async function canPerformProjectAction(userId, userRole, action, projectId, resource, connection) {
  try {
    // Check permission
    if (!hasSPCPermission(userRole, action)) {
      return false;
    }

    // Check project access
    const canAccess = await canAccessProject(userId, projectId, userRole, connection);
    if (!canAccess) {
      return false;
    }

    // Additional checks based on action
    switch (action) {
      case PROJECT_PERMISSIONS.TEAM_MANAGE:
        // Only managers can manage teams, and only for their assigned projects
        return userRole === SPC_ROLES.MANAGER;
        
      case PROJECT_PERMISSIONS.USER_ASSIGN_PROJECT:
        // Only admin can assign users to projects
        return userRole === SPC_ROLES.COMPANY_ADMIN;
        
      case PROJECT_PERMISSIONS.PROJECT_EDIT:
        // Admin and managers can edit projects
        return [SPC_ROLES.COMPANY_ADMIN, SPC_ROLES.MANAGER].includes(userRole);
        
      default:
        return true;
    }
  } catch (error) {
    console.error('Error checking project action permission:', error);
    return false;
  }
}

module.exports = {
  SPC_ROLES,
  PROJECT_PERMISSIONS,
  SPC_PERMISSION_MATRIX,
  SPC_ROLE_HIERARCHY,
  hasSPCPermission,
  getUserProjects,
  canAccessProject,
  getUserTeamMembers,
  filterDataByProjectAccess,
  canPerformProjectAction
};
