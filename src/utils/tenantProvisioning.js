/**
 * Tenant Database Provisioning Utility
 * Creates and initializes new tenant databases for companies
 */

const { getTenantConnection, initializeTenantDatabase } = require('../config/database.config');
const { getCompanyRegistry, getCompanyTheme } = require('../models/global');
const TenantUserSchema = require('../models/tenant/TenantUser');
const bcrypt = require('bcryptjs');
const { generateRandomPassword } = require('./passwordGenerator');
const { sendCompanyOnboardingEmail } = require('../services/emailService');

/**
 * Provision a new tenant database for a company
 * @param {Object} companyData - Company information
 * @param {Object} adminData - Company admin information
 * @param {Object} onboardedBy - Super admin or sub admin who onboarded
 * @returns {Object} Company registry and admin credentials
 */
const provisionTenantDatabase = async (companyData, adminData, onboardedBy) => {
  try {
    console.log(`\n🏗️  Provisioning tenant database for: ${companyData.companyName}`);
    
    // Step 1: Create company registry in global database
    const CompanyRegistry = await getCompanyRegistry();
    
    const company = new CompanyRegistry({
      companyName: companyData.companyName,
      email: companyData.email,
      phone: companyData.phone,
      website: companyData.website,
      address: companyData.address,
      subscription: companyData.subscription || {
        plan: 'trial',
        status: 'trial',
        maxEmployees: 50,
        maxAdmins: 2
      },
      enabledModules: companyData.enabledModules || ['hr', 'attendance'],
      companyAdmin: {
        email: adminData.email
      },
      onboardedBy: onboardedBy._id,
      onboardedByModel: onboardedBy.role === 'superadmin' ? 'SuperAdmin' : 'SubSuperAdmin',
      status: 'pending',
      databaseStatus: 'provisioning'
    });
    
    await company.save();
    console.log(`✅ Company registry created: ${company.companyCode}`);
    
    // Step 2: Initialize tenant database
    const tenantConnection = await initializeTenantDatabase(company.companyId);
    console.log(`✅ Tenant database initialized: ${company.tenantDatabaseName}`);
    
    // Step 3: Create company admin user in tenant database
    const TenantUser = tenantConnection.model('User', TenantUserSchema);
    
    // Generate password
    const tempPassword = adminData.password || generateRandomPassword();
    
    const companyAdmin = new TenantUser({
      email: adminData.email,
      password: tempPassword,
      firstName: adminData.firstName,
      lastName: adminData.lastName,
      phone: adminData.phone,
      role: 'company_admin',
      isActive: true,
      isFirstLogin: true,
      mustChangePassword: true
    });
    
    await companyAdmin.save();
    console.log(`✅ Company admin created: ${companyAdmin.email}`);
    
    // Step 4: Update company registry with admin userId
    company.companyAdmin.userId = companyAdmin._id.toString();
    company.companyAdmin.createdAt = new Date();
    company.status = 'active';
    company.databaseStatus = 'active';
    await company.save();
    
    // Step 5: Create default company theme
    const CompanyTheme = await getCompanyTheme();
    const theme = new CompanyTheme({
      companyId: company.companyId,
      logo: companyData.logo || {},
      backgroundImage: companyData.backgroundImage || {},
      colors: companyData.colors || {},
      loginPage: {
        welcomeMessage: `Welcome to ${company.companyName}`,
        subtitle: 'Sign in to your account',
        showCompanyName: true,
        showLogo: true,
        showBackgroundImage: true
      }
    });
    
    await theme.save();
    console.log(`✅ Company theme created`);
    
    // Update company with theme reference
    company.themeId = theme._id;
    await company.save();
    
    // Step 6: Send onboarding email
    try {
      await sendCompanyOnboardingEmail({
        companyName: company.companyName,
        adminEmail: adminData.email,
        adminName: `${adminData.firstName} ${adminData.lastName}`,
        tempPassword: tempPassword,
        companyCode: company.companyCode,
        loginUrl: `${process.env.FRONTEND_URL}/login/company/${company.companyId}`
      });
      console.log(`✅ Onboarding email sent to: ${adminData.email}`);
    } catch (emailError) {
      console.error('⚠️  Failed to send onboarding email:', emailError.message);
    }
    
    console.log(`\n🎉 Tenant provisioning completed for: ${company.companyName}`);
    console.log(`   Company Code: ${company.companyCode}`);
    console.log(`   Company ID: ${company.companyId}`);
    console.log(`   Database: ${company.tenantDatabaseName}`);
    console.log(`   Admin Email: ${adminData.email}`);
    console.log(`   Temp Password: ${tempPassword}\n`);
    
    return {
      company: {
        id: company.companyId,
        code: company.companyCode,
        name: company.companyName,
        email: company.email,
        databaseName: company.tenantDatabaseName,
        status: company.status
      },
      admin: {
        email: adminData.email,
        tempPassword: tempPassword,
        userId: companyAdmin._id.toString()
      },
      theme: {
        id: theme._id.toString()
      }
    };
    
  } catch (error) {
    console.error('❌ Error provisioning tenant database:', error);
    throw error;
  }
};

/**
 * Delete/Deactivate a tenant database
 * @param {string} companyId - Company ID
 */
const deactivateTenantDatabase = async (companyId) => {
  try {
    const CompanyRegistry = await getCompanyRegistry();
    const company = await CompanyRegistry.findOne({ companyId });
    
    if (!company) {
      throw new Error('Company not found');
    }
    
    company.status = 'inactive';
    company.databaseStatus = 'suspended';
    company.isActive = false;
    await company.save();
    
    console.log(`✅ Tenant database deactivated: ${company.tenantDatabaseName}`);
    return company;
  } catch (error) {
    console.error('❌ Error deactivating tenant database:', error);
    throw error;
  }
};

module.exports = {
  provisionTenantDatabase,
  deactivateTenantDatabase
};
