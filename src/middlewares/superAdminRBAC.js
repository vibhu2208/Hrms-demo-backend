// Super Admin RBAC Middleware
// Phase 7: Role-Based Access Control for Super Admin Module

const { 
  canAccessRoute, 
  hasPermission, 
  hasModuleAccess, 
  getModuleFromRoute,
  SUPER_ADMIN_ROLES,
  MODULES,
  ACTIONS 
} = require('../config/superAdminRoles');
const { logAction } = require('./auditLog');

// Middleware to check Super Admin internal role permissions
const checkSuperAdminPermission = (requiredModule, requiredAction) => {
  return async (req, res, next) => {
    try {
      // Ensure user is authenticated and is a super admin
      if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Super Admin role required.'
        });
      }

      // Get user's internal role (default to super_admin if not set)
      const userInternalRole = req.user.internalRole || SUPER_ADMIN_ROLES.SUPER_ADMIN;
      
      // SUPER ADMIN BYPASS - Grant full access to Super Admin
      if (req.user.role === 'superadmin' && (userInternalRole === SUPER_ADMIN_ROLES.SUPER_ADMIN || userInternalRole === 'super_admin')) {
        return next();
      }
      
      // Also bypass if user role is directly 'super_admin' (for consistency)
      if (userInternalRole === 'super_admin' || userInternalRole === SUPER_ADMIN_ROLES.SUPER_ADMIN) {
        return next();
      }

      // Check if user has permission for the required module and action
      if (!hasPermission(userInternalRole, requiredModule, requiredAction)) {
        // Log unauthorized access attempt
        await logAction(
          req.user._id, 
          null, 
          'UNAUTHORIZED_ACCESS_ATTEMPT', 
          'SuperAdmin', 
          null, 
          {
            attemptedModule: requiredModule,
            attemptedAction: requiredAction,
            userRole: userInternalRole,
            route: req.originalUrl,
            method: req.method
          }, 
          req
        );

        return res.status(403).json({
          success: false,
          message: `Access denied. Insufficient permissions for ${requiredModule} - ${requiredAction}`,
          details: {
            requiredModule,
            requiredAction,
            userRole: userInternalRole
          }
        });
      }

      // Add permission info to request for logging
      req.superAdminPermission = {
        module: requiredModule,
        action: requiredAction,
        userRole: userInternalRole
      };

      next();
    } catch (error) {
      console.error('Super Admin RBAC Error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during permission check'
      });
    }
  };
};

// Dynamic middleware that checks permissions based on route and method
const checkRoutePermission = async (req, res, next) => {
  try {
    // Ensure user is authenticated and is a super admin
    if (!req.user || req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin role required.'
      });
    }

    // Get user's internal role
    const userInternalRole = req.user.internalRole || SUPER_ADMIN_ROLES.SUPER_ADMIN;

    // Check if user can access this route with this method
    if (!canAccessRoute(userInternalRole, req.originalUrl, req.method)) {
      // Log unauthorized access attempt
      await logAction(
        req.user._id, 
        null, 
        'UNAUTHORIZED_ROUTE_ACCESS', 
        'SuperAdmin', 
        null, 
        {
          route: req.originalUrl,
          method: req.method,
          userRole: userInternalRole
        }, 
        req
      );

      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions for this operation.',
        details: {
          route: req.originalUrl,
          method: req.method,
          userRole: userInternalRole
        }
      });
    }

    // Add route permission info to request
    req.superAdminPermission = {
      module: getModuleFromRoute(req.originalUrl),
      userRole: userInternalRole,
      route: req.originalUrl,
      method: req.method
    };

    next();
  } catch (error) {
    console.error('Route Permission Check Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during route permission check'
    });
  }
};

// Middleware to check if user has access to a specific module
const requireModuleAccess = (module) => {
  return async (req, res, next) => {
    try {
      if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Super Admin role required.'
        });
      }

      const userInternalRole = req.user.internalRole || SUPER_ADMIN_ROLES.SUPER_ADMIN;
      
      // SUPER ADMIN BYPASS - Grant full access to Super Admin
      if (req.user.role === 'superadmin' && (userInternalRole === SUPER_ADMIN_ROLES.SUPER_ADMIN || userInternalRole === 'super_admin')) {
        return next();
      }
      
      // Also bypass if user role is directly 'super_admin' (for consistency)
      if (userInternalRole === 'super_admin' || userInternalRole === SUPER_ADMIN_ROLES.SUPER_ADMIN) {
        return next();
      }

      if (!hasModuleAccess(userInternalRole, module)) {
        await logAction(
          req.user._id, 
          null, 
          'UNAUTHORIZED_MODULE_ACCESS', 
          'SuperAdmin', 
          null, 
          {
            attemptedModule: module,
            userRole: userInternalRole
          }, 
          req
        );

        return res.status(403).json({
          success: false,
          message: `Access denied. No access to ${module} module.`,
          details: {
            module,
            userRole: userInternalRole
          }
        });
      }

      req.superAdminPermission = {
        module,
        userRole: userInternalRole
      };

      next();
    } catch (error) {
      console.error('Module Access Check Error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during module access check'
      });
    }
  };
};

// Middleware to check minimum role level (for hierarchical permissions)
const requireMinimumRoleLevel = (minimumLevel) => {
  return async (req, res, next) => {
    try {
      if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Super Admin role required.'
        });
      }

      const userInternalRole = req.user.internalRole || SUPER_ADMIN_ROLES.SUPER_ADMIN;
      const { getRoleLevel } = require('../config/superAdminRoles');
      const userLevel = getRoleLevel(userInternalRole);

      if (userLevel > minimumLevel) {
        await logAction(
          req.user._id, 
          null, 
          'INSUFFICIENT_ROLE_LEVEL', 
          'SuperAdmin', 
          null, 
          {
            userRole: userInternalRole,
            userLevel,
            requiredLevel: minimumLevel
          }, 
          req
        );

        return res.status(403).json({
          success: false,
          message: 'Access denied. Insufficient role level.',
          details: {
            userRole: userInternalRole,
            userLevel,
            requiredLevel: minimumLevel
          }
        });
      }

      next();
    } catch (error) {
      console.error('Role Level Check Error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during role level check'
      });
    }
  };
};

// Helper middleware to add user's permissions to response (for frontend use)
const addUserPermissions = async (req, res, next) => {
  try {
    if (req.user && req.user.role === 'superadmin') {
      const userInternalRole = req.user.internalRole || SUPER_ADMIN_ROLES.SUPER_ADMIN;
      const { PERMISSION_MATRIX, ROLE_DEFINITIONS } = require('../config/superAdminRoles');
      
      req.userPermissions = {
        internalRole: userInternalRole,
        roleDefinition: ROLE_DEFINITIONS[userInternalRole],
        permissions: PERMISSION_MATRIX[userInternalRole] || {},
        modules: Object.keys(PERMISSION_MATRIX[userInternalRole] || {})
      };
    }
    next();
  } catch (error) {
    console.error('Add User Permissions Error:', error);
    next(); // Don't block request if this fails
  }
};

module.exports = {
  checkSuperAdminPermission,
  checkRoutePermission,
  requireModuleAccess,
  requireMinimumRoleLevel,
  addUserPermissions
};
