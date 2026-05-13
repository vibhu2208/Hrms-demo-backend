const tenantConnectionManager = require('../config/tenantConnection');
const Client = require('../models/Client');

/**
 * Middleware to inject tenant context into requests
 * This middleware should be used for all tenant-specific routes
 */
const tenantMiddleware = async (req, res, next) => {
  try {
    // Skip tenant middleware for super admin routes
    if (req.path.startsWith('/api/super-admin')) {
      return next();
    }

    // Get companyId from auth middleware (new multi-tenant system)
    const companyId = req.companyId;
    
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID not found in request context'
      });
    }

    // Get tenant database connection using new system
    const { getTenantConnection } = require('../config/database.config');
    const tenantConnection = await getTenantConnection(companyId);
    
    // Inject tenant context into request
    req.tenant = {
      clientId: companyId, // For backward compatibility
      companyId: companyId,
      connection: tenantConnection,
      dbName: `tenant_${companyId}`
    };
    
    console.log(`🏢 Tenant Context: Company ${companyId}`);
    
    next();
  } catch (error) {
    console.error('❌ Tenant Middleware Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to establish tenant context',
      error: error.message
    });
  }
};

/**
 * Middleware to ensure Super Admin context
 * This middleware should be used for super admin routes only
 */
const superAdminMiddleware = async (req, res, next) => {
  try {
    // Ensure user is super admin
    if (req.user?.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Super Admin access required'
      });
    }

    // Get Super Admin database connection
    const superAdminConnection = tenantConnectionManager.getSuperAdminConnection();
    
    // Inject Super Admin context
    req.superAdmin = {
      connection: superAdminConnection,
      user: req.user
    };

    console.log(`👑 Super Admin Context: ${req.user.email}`);
    
    next();
  } catch (error) {
    console.error('❌ Super Admin Middleware Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to establish Super Admin context',
      error: error.message
    });
  }
};

/**
 * Helper function to get tenant model
 * @param {Object} tenantConnection - Tenant database connection
 * @param {string} modelName - Name of the model
 * @param {Object} schema - Mongoose schema
 * @returns {Model} - Tenant-specific model
 */
const getTenantModel = (tenantConnection, modelName, schema) => {
  try {
    // For Employee-related models, always recreate to ensure latest schema is used
    // This prevents caching issues when schema is updated
    if ((modelName === 'Employee' || modelName === 'TenantEmployee') && tenantConnection.models[modelName]) {
      console.log(`🔄 Recreating ${modelName} model to use updated schema`);
      delete tenantConnection.models[modelName];
    }
    
    // Check if model already exists in this connection
    if (tenantConnection.models[modelName]) {
      return tenantConnection.models[modelName];
    }
    
    // Create new model for this tenant
    return tenantConnection.model(modelName, schema);
  } catch (error) {
    console.error(`❌ Error creating tenant model ${modelName}:`, error);
    throw error;
  }
};

/**
 * Middleware to validate tenant subscription and module access
 */
const validateTenantAccess = (requiredModule = null) => {
  return async (req, res, next) => {
    try {
      const { client } = req.tenant;
      
      // Check subscription status
      if (client.subscription?.status !== 'active') {
        return res.status(403).json({
          success: false,
          message: 'Subscription is not active'
        });
      }

      // Check subscription expiry
      if (client.subscription?.endDate && new Date() > new Date(client.subscription.endDate)) {
        return res.status(403).json({
          success: false,
          message: 'Subscription has expired'
        });
      }

      // Check module access if required
      if (requiredModule && !client.enabledModules.includes(requiredModule)) {
        return res.status(403).json({
          success: false,
          message: `Module '${requiredModule}' is not enabled for this client`
        });
      }

      next();
    } catch (error) {
      console.error('❌ Tenant Access Validation Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to validate tenant access',
        error: error.message
      });
    }
  };
};

module.exports = {
  tenantMiddleware,
  superAdminMiddleware,
  getTenantModel,
  validateTenantAccess
};
