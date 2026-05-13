/**
 * Global Models Index
 * All models stored in hrms_global database
 */

const { getGlobalConnection } = require('../../config/database.config');

// Import schemas
const SuperAdminSchema = require('./SuperAdmin');
const SubSuperAdminSchema = require('./SubSuperAdmin');
const CompanyRegistrySchema = require('./CompanyRegistry');
const CompanyThemeSchema = require('./CompanyTheme');

// Create models with global connection
let SuperAdmin, SubSuperAdmin, CompanyRegistry, CompanyTheme;

const initializeGlobalModels = async () => {
  const globalConn = await getGlobalConnection();
  
  SuperAdmin = globalConn.model('SuperAdmin', SuperAdminSchema);
  SubSuperAdmin = globalConn.model('SubSuperAdmin', SubSuperAdminSchema);
  CompanyRegistry = globalConn.model('CompanyRegistry', CompanyRegistrySchema);
  CompanyTheme = globalConn.model('CompanyTheme', CompanyThemeSchema);
  
  return {
    SuperAdmin,
    SubSuperAdmin,
    CompanyRegistry,
    CompanyTheme
  };
};

// Export getter functions
module.exports = {
  initializeGlobalModels,
  getSuperAdmin: async () => {
    if (!SuperAdmin) await initializeGlobalModels();
    return SuperAdmin;
  },
  getSubSuperAdmin: async () => {
    if (!SubSuperAdmin) await initializeGlobalModels();
    return SubSuperAdmin;
  },
  getCompanyRegistry: async () => {
    if (!CompanyRegistry) await initializeGlobalModels();
    return CompanyRegistry;
  },
  getCompanyTheme: async () => {
    if (!CompanyTheme) await initializeGlobalModels();
    return CompanyTheme;
  }
};
