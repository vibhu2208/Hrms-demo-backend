const permissionService = require('../services/permissionService');

const checkPermission = (permissionCode, scope = 'own') => {
  return async (req, res, next) => {
    try {
      const userId = req.user._id || req.user.userId;
      const resourceOwnerId = req.params.employeeId || req.params.userId || req.body.employeeId || null;
      
      const hasPermission = await permissionService.checkPermission(
        userId,
        permissionCode,
        scope,
        resourceOwnerId,
        req.tenant?.connection
      );

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to perform this action',
          requiredPermission: permissionCode,
          requiredScope: scope
        });
      }

      next();
    } catch (error) {
      console.error('Permission middleware error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions',
        error: error.message
      });
    }
  };
};

const checkAnyPermission = (permissionCodes, scope = 'own') => {
  return async (req, res, next) => {
    try {
      const userId = req.user._id || req.user.userId;
      const resourceOwnerId = req.params.employeeId || req.params.userId || req.body.employeeId || null;

      for (const permissionCode of permissionCodes) {
        const hasPermission = await permissionService.checkPermission(
          userId,
          permissionCode,
          scope,
          resourceOwnerId,
          req.tenant?.connection
        );

        if (hasPermission) {
          return next();
        }
      }

      return res.status(403).json({
        success: false,
        message: 'You do not have any of the required permissions',
        requiredPermissions: permissionCodes,
        requiredScope: scope
      });
    } catch (error) {
      console.error('Permission middleware error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions',
        error: error.message
      });
    }
  };
};

const checkAllPermissions = (permissionCodes, scope = 'own') => {
  return async (req, res, next) => {
    try {
      const userId = req.user._id || req.user.userId;
      const resourceOwnerId = req.params.employeeId || req.params.userId || req.body.employeeId || null;

      for (const permissionCode of permissionCodes) {
        const hasPermission = await permissionService.checkPermission(
          userId,
          permissionCode,
          scope,
          resourceOwnerId,
          req.tenant?.connection
        );

        if (!hasPermission) {
          return res.status(403).json({
            success: false,
            message: 'You do not have all required permissions',
            requiredPermissions: permissionCodes,
            missingPermission: permissionCode,
            requiredScope: scope
          });
        }
      }

      next();
    } catch (error) {
      console.error('Permission middleware error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions',
        error: error.message
      });
    }
  };
};

module.exports = {
  checkPermission,
  checkAnyPermission,
  checkAllPermissions
};
