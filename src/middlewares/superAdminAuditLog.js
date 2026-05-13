// Enhanced Super Admin Audit Logging Middleware
// Phase 7: Comprehensive audit trails for Super Admin operations

const SuperAdminAuditLog = require('../models/SuperAdminAuditLog');
const { getModuleFromRoute } = require('../config/superAdminRoles');

// Enhanced audit logging function for Super Admin operations
const logSuperAdminAction = async (
  userId,
  userInternalRole,
  action,
  resourceType,
  resourceId,
  details = {},
  req = null,
  result = 'success',
  errorMessage = null
) => {
  try {
    // Use the passed userInternalRole or default to super_admin
    if (!userInternalRole) {
      userInternalRole = req?.user?.internalRole || 'super_admin';
    }
    
    // Extract clientId from details
    const clientId = details.clientId;

    // Determine module from route or action
    let module = 'dashboard';
    if (req && req.originalUrl) {
      module = getModuleFromRoute(req.originalUrl) || 'dashboard';
    } else {
      // Infer module from action
      if (action.includes('CLIENT')) module = 'client_management';
      else if (action.includes('PACKAGE')) module = 'package_management';
      else if (action.includes('BILLING') || action.includes('SUBSCRIPTION')) module = 'subscription_billing';
      else if (action.includes('COMPLIANCE')) module = 'compliance_legal';
      else if (action.includes('CONFIG') || action.includes('SYSTEM')) module = 'system_config';
      else if (action.includes('DATA') || action.includes('BACKUP')) module = 'data_management';
      else if (action.includes('REPORT') || action.includes('EXPORT')) module = 'reports_center';
      else if (action.includes('ROLE') || action.includes('USER')) module = 'role_management';
      else if (action.includes('AUDIT')) module = 'audit_logs';
      else if (action.includes('ANALYTICS') || action.includes('MONITORING')) module = 'analytics_monitoring';
    }

    // Extract request metadata
    const requestMetadata = {
      timestamp: new Date()
    };

    if (req) {
      requestMetadata.ip = req.ip || req.connection?.remoteAddress || 'unknown';
      requestMetadata.userAgent = req.get('User-Agent') || 'unknown';
      requestMetadata.route = req.originalUrl || req.url || 'unknown';
      requestMetadata.method = req.method || 'unknown';
    }

    // Determine severity based on action
    let severity = 'medium';
    if (action.includes('DELETE') || action.includes('UNAUTHORIZED') || action.includes('FAILED')) {
      severity = 'high';
    } else if (action.includes('CREATE') || action.includes('UPDATE') || action.includes('APPROVE')) {
      severity = 'medium';
    } else {
      severity = 'low';
    }

    // Create audit log entry
    const auditLog = new SuperAdminAuditLog({
      userId,
      userInternalRole,
      action,
      module,
      resourceType,
      resourceId,
      clientId,
      details,
      requestMetadata,
      result,
      errorMessage,
      severity,
      sessionId: req?.sessionID || req?.session?.id,
      tags: generateTags(action, module, resourceType)
    });

    await auditLog.save();
    
    console.log(`[SUPER ADMIN AUDIT] ${userInternalRole} - ${action} - ${module} - ${result}`);
    
    return auditLog;
  } catch (error) {
    console.error('Error logging Super Admin action:', error);
    // Don't throw error to avoid breaking the main operation
  }
};

// Generate tags for categorization
const generateTags = (action, module, resourceType) => {
  const tags = [];
  
  // Add action-based tags
  if (action.includes('CREATE')) tags.push('creation');
  if (action.includes('UPDATE')) tags.push('modification');
  if (action.includes('DELETE')) tags.push('deletion');
  if (action.includes('EXPORT')) tags.push('data-export');
  if (action.includes('UNAUTHORIZED')) tags.push('security-violation');
  if (action.includes('FAILED')) tags.push('failure');
  
  // Add module-based tags
  tags.push(`module-${module}`);
  
  // Add resource-based tags
  if (resourceType) tags.push(`resource-${resourceType.toLowerCase()}`);
  
  // Add compliance tags
  if (module === 'client_management' || module === 'compliance_legal') {
    tags.push('gdpr-relevant');
  }
  
  if (action.includes('EXPORT') || action.includes('DELETE')) {
    tags.push('sensitive-operation');
  }
  
  return tags;
};

// Middleware factory for automatic audit logging
const auditSuperAdminAction = (action, resourceType) => {
  return async (req, res, next) => {
    // Skip audit logging if Super Admin bypass is active
    if (req.superAdminBypass || req.forcedBypass) {
      return next();
    }
    
    // Store original res.json to intercept response
    const originalJson = res.json;
    
    res.json = function(data) {
      // Log the action after response
      setImmediate(async () => {
        try {
          const result = data.success ? 'success' : 'failure';
          const errorMessage = data.success ? null : data.message;
          
          await logSuperAdminAction(
            req.user?._id,
            req.user?.internalRole || 'super_admin',
            action,
            resourceType,
            req.params?.id || data.data?._id,
            {
              requestBody: req.body,
              queryParams: req.query,
              responseData: data.success ? { id: data.data?._id } : null,
              clientId: req.body?.clientId || req.params?.clientId
            },
            req,
            result,
            errorMessage
          );
        } catch (error) {
          console.error('Error in audit middleware:', error);
        }
      });
      
      // Call original res.json
      return originalJson.call(this, data);
    };
    
    next();
  };
};

// Middleware for logging route access
const logRouteAccess = async (req, res, next) => {
  try {
    if (req.user && req.user.role === 'superadmin') {
      // Only log significant routes, not every API call
      const significantRoutes = [
        '/dashboard',
        '/clients',
        '/packages',
        '/billing',
        '/compliance',
        '/config',
        '/reports',
        '/audit'
      ];
      
      const isSignificantRoute = significantRoutes.some(route => 
        req.originalUrl.includes(route)
      );
      
      if (isSignificantRoute && req.method === 'GET') {
        await logSuperAdminAction(
          req.user._id,
          null,
          'ROUTE_ACCESS',
          'System',
          null,
          {
            route: req.originalUrl,
            method: req.method
          },
          req,
          'success'
        );
      }
    }
  } catch (error) {
    console.error('Error logging route access:', error);
  }
  
  next();
};

// Middleware for logging authentication events
const logAuthEvent = (action) => {
  return async (req, res, next) => {
    const originalJson = res.json;
    
    res.json = function(data) {
      setImmediate(async () => {
        try {
          if (req.user || data.user) {
            const user = req.user || data.user;
            if (user.role === 'superadmin') {
              await logSuperAdminAction(
                user._id,
                null,
                action,
                'User',
                user._id,
                {
                  email: user.email,
                  internalRole: user.internalRole
                },
                req,
                data.success ? 'success' : 'failure',
                data.success ? null : data.message
              );
            }
          }
        } catch (error) {
          console.error('Error logging auth event:', error);
        }
      });
      
      return originalJson.call(this, data);
    };
    
    next();
  };
};

module.exports = {
  logSuperAdminAction,
  auditSuperAdminAction,
  logRouteAccess,
  logAuthEvent
};
