const AuditLog = require('../models/AuditLog');

// Audit logging middleware
const auditLog = (action, resource) => {
  return async (req, res, next) => {
    // Store original res.json to capture response
    const originalJson = res.json;
    
    res.json = function(data) {
      // Log the action after response
      setImmediate(async () => {
        try {
          const logData = {
            userId: req.user ? req.user._id : null,
            clientId: req.user ? req.user.clientId : null,
            action,
            resource,
            resourceId: req.params.id || req.body._id || req.body.id,
            details: {
              method: req.method,
              url: req.originalUrl,
              body: req.method !== 'GET' ? req.body : undefined,
              query: req.query,
              params: req.params
            },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            status: res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'failed',
            errorMessage: res.statusCode >= 400 ? data.message : undefined
          };

          await AuditLog.create(logData);
        } catch (error) {
          console.error('Audit logging error:', error);
        }
      });

      // Call original json method
      return originalJson.call(this, data);
    };

    next();
  };
};

// Helper function to log specific actions
const logAction = async (userId, clientId, action, resource, resourceId, details, req) => {
  try {
    const logData = {
      userId,
      clientId,
      action,
      resource,
      resourceId,
      details,
      ipAddress: req ? (req.ip || req.connection.remoteAddress) : null,
      userAgent: req ? req.get('User-Agent') : null,
      status: 'success'
    };

    await AuditLog.create(logData);
  } catch (error) {
    console.error('Manual audit logging error:', error);
  }
};

module.exports = { auditLog, logAction };
