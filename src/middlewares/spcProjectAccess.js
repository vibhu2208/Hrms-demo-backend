const { SPC_ROLES, PROJECT_PERMISSIONS, hasSPCPermission, canAccessProject, filterDataByProjectAccess } = require('../config/spcProjectPermissions');
const { getTenantConnection } = require('../config/database.config');

/**
 * SPC Project Access Middleware
 * Enforces project-based access control for all API endpoints
 */

class SPCProjectAccessMiddleware {
  /**
   * Middleware to check if user has permission for specific action
   */
  static requirePermission(permission) {
    return async (req, res, next) => {
      try {
        console.log('🔐 SPC Permission Check:');
        console.log('   Required permission:', permission);
        console.log('   User role:', req.user?.role);
        console.log('   User email:', req.user?.email);
        
        const userRole = req.user.role;
        
        if (!hasSPCPermission(userRole, permission)) {
          console.log('❌ Permission denied for role:', userRole, 'permission:', permission);
          return res.status(403).json({
            success: false,
            message: 'Insufficient permissions for this action'
          });
        }
        
        console.log('✅ Permission granted for role:', userRole);
        next();
      } catch (error) {
        console.error('❌ Permission check error:', error);
        console.error('❌ Stack trace:', error.stack);
        res.status(500).json({
          success: false,
          message: 'Permission check failed'
        });
      }
    };
  }

  /**
   * Middleware to check if user can access specific project
   */
  static requireProjectAccess() {
    return async (req, res, next) => {
      try {
        console.log('🔍 Full req.user object:', JSON.stringify(req.user, null, 2));
        
        const userId = req.user._id || req.user.id;
        const userRole = req.user.role;
        const companyId = req.user.companyId;
        const projectId = req.params.projectId || req.body.projectId;
        
        console.log('🔍 Project Access Check Debug:');
        console.log('   User ID:', userId);
        console.log('   User Role:', userRole);
        console.log('   Company ID:', companyId);
        console.log('   Project ID:', projectId);
        
        if (!projectId) {
          return res.status(400).json({
            success: false,
            message: 'Project ID is required'
          });
        }

        // Get tenant connection
        const connection = await getTenantConnection(companyId);
        
        // Check project access
        const canAccess = await canAccessProject(userId, projectId, userRole, connection);
        console.log('   Can Access:', canAccess);
        
        if (!canAccess) {
          console.log('❌ Access denied - returning 403');
          return res.status(403).json({
            success: false,
            message: 'Access denied to this project'
          });
        }
        
        // Add project to request for downstream use
        req.projectId = projectId;
        req.tenantConnection = connection;
        
        next();
      } catch (error) {
        console.error('Project access check error:', error);
        res.status(500).json({
          success: false,
          message: 'Project access check failed'
        });
      }
    };
  }

  /**
   * Middleware to filter query results based on user's project assignments
   */
  static filterByProjectAccess() {
    return async (req, res, next) => {
      try {
        const { userId, userRole, companyId } = req.user;
        
        // Admin doesn't need filtering
        if (userRole === SPC_ROLES.COMPANY_ADMIN) {
          return next();
        }

        // Get tenant connection
        const connection = await getTenantConnection(companyId);
        
        // Store connection for downstream use
        req.tenantConnection = connection;
        
        // Override res.json to filter responses
        const originalJson = res.json;
        res.json = function(data) {
          if (data && data.data && Array.isArray(data.data)) {
            // Filter the data array based on project access
            filterDataByProjectAccess(userId, userRole, data.data, connection)
              .then(filteredData => {
                data.data = filteredData;
                data.count = filteredData.length;
                originalJson.call(this, data);
              })
              .catch(error => {
                console.error('Data filtering error:', error);
                originalJson.call(this, data);
              });
          } else {
            originalJson.call(this, data);
          }
        };
        
        next();
      } catch (error) {
        console.error('Project access filtering error:', error);
        res.status(500).json({
          success: false,
          message: 'Project access filtering failed'
        });
      }
    };
  }

  /**
   * Middleware to add project context to requests
   */
  static addProjectContext() {
    return async (req, res, next) => {
      try {
        const { userId, userRole, companyId } = req.user;
        
        // Get tenant connection
        const connection = await getTenantConnection(companyId);
        
        // Get user's assigned projects
        const ProjectAssignment = connection.model('ProjectAssignment', new mongoose.Schema({}, { strict: false }), 'projectassignments');
        const assignments = await ProjectAssignment.find({ 
          userId: userId, 
          isActive: true 
        }).populate('projectId');
        
        // Add project context to request
        req.userProjects = assignments.map(a => a.projectId);
        req.tenantConnection = connection;
        
        next();
      } catch (error) {
        console.error('Project context error:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to load project context'
        });
      }
    };
  }

  /**
   * Middleware to validate project assignments in request body
   */
  static validateProjectAssignments() {
    return async (req, res, next) => {
      try {
        const { companyId } = req.user;
        const { managers, hrs, employees } = req.body;
        
        // Get tenant connection
        const connection = await getTenantConnection(companyId);
        
        // Validate users exist and have correct roles
        const User = connection.model('User', new mongoose.Schema({}, { strict: false }), 'users');
        
        const validationPromises = [];
        
        // Validate managers
        if (managers && managers.length > 0) {
          validationPromises.push(
            User.find({ _id: { $in: managers }, role: SPC_ROLES.MANAGER })
              .then(users => {
                if (users.length !== managers.length) {
                  throw new Error('Invalid manager assignments');
                }
              })
          );
        }
        
        // Validate HRs
        if (hrs && hrs.length > 0) {
          validationPromises.push(
            User.find({ _id: { $in: hrs }, role: SPC_ROLES.HR })
              .then(users => {
                if (users.length !== hrs.length) {
                  throw new Error('Invalid HR assignments');
                }
              })
          );
        }
        
        // Validate employees
        if (employees && employees.length > 0) {
          validationPromises.push(
            User.find({ _id: { $in: employees }, role: SPC_ROLES.EMPLOYEE })
              .then(users => {
                if (users.length !== employees.length) {
                  throw new Error('Invalid employee assignments');
                }
              })
          );
        }
        
        await Promise.all(validationPromises);
        
        next();
      } catch (error) {
        console.error('Project assignment validation error:', error);
        res.status(400).json({
          success: false,
          message: 'Invalid project assignments',
          error: error.message
        });
      }
    };
  }

  /**
   * Middleware to check if user can manage team for specific project
   */
  static requireTeamManagementAccess() {
    return async (req, res, next) => {
      try {
        const { userId, userRole, companyId } = req.user;
        const { projectId } = req.params;
        
        // Only managers and admins can manage teams
        if (![SPC_ROLES.COMPANY_ADMIN, SPC_ROLES.MANAGER].includes(userRole)) {
          return res.status(403).json({
            success: false,
            message: 'Insufficient permissions for team management'
          });
        }

        // Get tenant connection
        const connection = await getTenantConnection(companyId);
        
        // Check project access
        const canAccess = await canAccessProject(userId, projectId, userRole, connection);
        if (!canAccess) {
          return res.status(403).json({
            success: false,
            message: 'Access denied to this project'
          });
        }
        
        next();
      } catch (error) {
        console.error('Team management access check error:', error);
        res.status(500).json({
          success: false,
          message: 'Team management access check failed'
        });
      }
    };
  }
}

module.exports = SPCProjectAccessMiddleware;
