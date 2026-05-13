// Universal Super Admin Bypass Middleware
// This middleware gives Super Admin full access to everything, bypassing all permission checks

const { SUPER_ADMIN_ROLES } = require('../config/superAdminRoles');

/**
 * Universal Super Admin bypass middleware
 * Grants full access to Super Admin for all operations
 */
const superAdminBypass = (req, res, next) => {
  // Check if user is authenticated
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  // Get user role and internal role
  const userRole = req.user.role;
  const userInternalRole = req.user.internalRole;

  // SUPER ADMIN BYPASS - Grant full access to Super Admin
  if (
    userRole === 'superadmin' || 
    userRole === 'super_admin' ||
    userInternalRole === SUPER_ADMIN_ROLES.SUPER_ADMIN ||
    userInternalRole === 'super_admin'
  ) {
    // Add bypass flag to request for logging
    req.superAdminBypass = true;
    req.superAdminPermission = {
      bypassed: true,
      userRole: userRole,
      userInternalRole: userInternalRole,
      fullAccess: true
    };
    
    // Debug log to verify bypass is working
    console.log('🚀 SUPER ADMIN BYPASS ACTIVATED:', {
      userRole,
      userInternalRole,
      route: req.originalUrl,
      method: req.method
    });
    
    return next();
  }

  // If not Super Admin, continue to normal permission checks
  next();
};

/**
 * Middleware that forces Super Admin bypass (use with caution)
 * This completely bypasses all permission checks for Super Admin
 */
const forceSuperAdminBypass = (req, res, next) => {
  // Check if user is authenticated
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  // Get user role and internal role
  const userRole = req.user.role;
  const userInternalRole = req.user.internalRole;

  // FORCE SUPER ADMIN BYPASS - Grant full access to Super Admin
  if (
    userRole === 'superadmin' || 
    userRole === 'super_admin' ||
    userInternalRole === SUPER_ADMIN_ROLES.SUPER_ADMIN ||
    userInternalRole === 'super_admin'
  ) {
    // Add bypass flag to request for logging
    req.superAdminBypass = true;
    req.forcedBypass = true;
    req.superAdminPermission = {
      bypassed: true,
      forced: true,
      userRole: userRole,
      userInternalRole: userInternalRole,
      fullAccess: true
    };
    
    return next();
  }

  // If not Super Admin, deny access
  return res.status(403).json({
    success: false,
    message: 'Access denied. Super Admin role required.'
  });
};

/**
 * Check if current user is Super Admin
 */
const isSuperAdmin = (req) => {
  if (!req.user) return false;
  
  const userRole = req.user.role;
  const userInternalRole = req.user.internalRole;

  return (
    userRole === 'superadmin' || 
    userRole === 'super_admin' ||
    userInternalRole === SUPER_ADMIN_ROLES.SUPER_ADMIN ||
    userInternalRole === 'super_admin'
  );
};

/**
 * Middleware that only allows Super Admin access
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (!isSuperAdmin(req)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Super Admin role required.'
    });
  }

  // Add Super Admin flag to request
  req.isSuperAdmin = true;
  next();
};

module.exports = {
  superAdminBypass,
  forceSuperAdminBypass,
  isSuperAdmin,
  requireSuperAdmin
};
