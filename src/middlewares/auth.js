const { verifyToken } = require('../utils/jwt');
const TenantUserSchema = require('../models/tenant/TenantUser');
const { getTenantConnection } = require('../config/database.config');
const { getSuperAdmin } = require('../models/global');
const tokenBlacklistService = require('../services/tokenBlacklistService');

const protect = async (req, res, next) => {
  let tenantConnection = null;
  
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // SECURITY: Check if token is blacklisted
    const isBlacklisted = await tokenBlacklistService.isBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: 'Token has been revoked. Please login again.',
        code: 'TOKEN_REVOKED'
      });
    }

    // Handle both 'id' and 'userId' fields for backward compatibility
    const userId = decoded.userId || decoded.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token: missing user identifier'
      });
    }

    let user = null;

    // Check if token contains company info (tenant user)
    if (decoded.companyId) {
      // User is from a tenant database
      try {
        console.log(`🔍 Auth middleware: Fetching user from tenant DB for company: ${decoded.companyId}, userId: ${userId}`);
        tenantConnection = await getTenantConnection(decoded.companyId);
        const TenantUser = tenantConnection.model('User', TenantUserSchema);
        user = await TenantUser.findById(userId).select('-password');
        
        if (user) {
          console.log(`✅ User found in tenant DB: ${user.email}`);
        } else {
          console.error(`❌ User not found in tenant DB. userId: ${userId}, companyId: ${decoded.companyId}`);
          // Try to find user by email if available in token
          if (decoded.email) {
            console.log(`🔍 Trying to find user by email: ${decoded.email}`);
            user = await TenantUser.findOne({ email: decoded.email }).select('-password');
            if (user) {
              console.log(`✅ User found by email: ${user.email}`);
            }
          }
        }
        
        // Don't close the connection - it's cached and reused by getTenantConnection
      } catch (tenantError) {
        console.error('❌ Error accessing tenant database:', tenantError);
        console.error('Error details:', {
          message: tenantError.message,
          stack: tenantError.stack,
          companyId: decoded.companyId,
          userId: userId
        });
        return res.status(500).json({
          success: false,
          message: 'Error accessing company database',
          error: tenantError.message
        });
      }
    } else {
      // User is from main database (super admin, etc.)
      console.log('🔍 Auth middleware: Fetching super admin from global DB, userId:', userId);
      const SuperAdmin = await getSuperAdmin();
      user = await SuperAdmin.findById(userId).select('-password');
      if (user) {
        console.log(`✅ Super admin found: ${user.email}`);
      } else {
        console.error(`❌ Super admin not found. userId: ${userId}`);
      }
    }

    if (!user) {
      console.error('❌ User not found. Token details:', {
        userId: userId,
        companyId: decoded.companyId || 'none',
        email: decoded.email || 'none',
        tokenIssuedAt: decoded.iat ? new Date(decoded.iat * 1000).toISOString() : 'unknown'
      });
      return res.status(404).json({
        success: false,
        message: 'User not found. Please login again.',
        code: 'USER_NOT_FOUND',
        details: decoded.companyId 
          ? `User ${userId} not found in company ${decoded.companyId}` 
          : `User ${userId} not found in system`
      });
    }

    // SECURITY: Check if all user tokens are blacklisted (for exited employees)
    const isUserBlacklisted = await tokenBlacklistService.isUserBlacklisted(userId);
    if (isUserBlacklisted) {
      return res.status(401).json({
        success: false,
        message: 'Access has been revoked. Please contact HR.',
        code: 'ACCESS_REVOKED'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'User account is deactivated'
      });
    }

    // Attach user and company info to request
    console.log('🔍 Auth middleware - User fetched from DB:', JSON.stringify(user, null, 2));
    req.user = user;
    if (decoded.companyId) {
      req.user.companyId = decoded.companyId;
      req.companyId = decoded.companyId;
      req.companyCode = decoded.companyCode;
      req.databaseName = decoded.databaseName;
      
      // Attach tenant connection for controllers that need it
      req.tenant = {
        connection: tenantConnection,
        companyId: decoded.companyId
      };
    }
    
    console.log('🔍 Auth middleware - Final req.user:', JSON.stringify(req.user, null, 2));
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    // Don't close tenant connection - it's cached and reused
    res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    const userRole = req.user.role;
    
    console.log('🔐 Authorization check:');
    console.log('   User role:', userRole);
    console.log('   Allowed roles:', roles);
    
    // Map company_admin to admin for authorization checks
    const normalizedRole = userRole === 'company_admin' ? 'admin' : userRole;
    
    console.log('   Normalized role:', normalizedRole);
    
    // Check if user's role (or normalized role) is in allowed roles
    if (!roles.includes(userRole) && !roles.includes(normalizedRole)) {
      console.log('❌ Authorization failed');
      return res.status(403).json({
        success: false,
        message: `User role '${userRole}' is not authorized to access this route`
      });
    }
    
    console.log('✅ Authorization passed');
    next();
  };
};

// Super Admin specific middleware
const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Super Admin access required'
    });
  }
  next();
};

// Tenant isolation middleware - ensures users can only access their client's data
const tenantIsolation = async (req, res, next) => {
  try {
    // Super admins can access all data
    if (req.user.role === 'superadmin') {
      return next();
    }

    // Other users are restricted to their client's data
    if (!req.user.clientId) {
      return res.status(403).json({
        success: false,
        message: 'User not associated with any client'
      });
    }

    // Add clientId to request for filtering
    req.clientId = req.user.clientId;
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error in tenant isolation'
    });
  }
};

module.exports = { protect, authorize, requireSuperAdmin, tenantIsolation };
