const User = require('../models/User');
const Employee = require('../models/Employee');
const Company = require('../models/Company');
const { generateToken } = require('../utils/jwt');
const { OAuth2Client } = require('google-auth-library');
const { getTenantConnection } = require('../config/database.config');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { email, password, role, employeeId, firstName, lastName, isActive } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // If employeeId is provided, verify employee exists
    if (employeeId) {
      const employee = await Employee.findById(employeeId);
      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Employee not found'
        });
      }
    }

    // Create user
    const user = await User.create({
      email,
      password,
      role: role || 'employee',
      employeeId,
      firstName,
      lastName,
      isActive: isActive !== undefined ? isActive : true
    });

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          userId: user._id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          isActive: user.isActive
        },
        token
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  let tenantConnection = null;
  
  try {
    console.log('🔍 Login attempt:', req.body);
    const { email, password, companyId } = req.body;

    // Validate email & password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Step 1: Check if this is a super admin (in hrms_global)
    console.log('🔍 Checking if user is a super admin...');
    const { getSuperAdmin, getCompanyRegistry } = require('../models/global');
    const TenantUserSchema = require('../models/tenant/TenantUser');
    
    let user = null;
    let isTenantUser = false;
    let userCompany = null;
    
    try {
      const SuperAdmin = await getSuperAdmin();
      const superAdmin = await SuperAdmin.findOne({ email }).select('+password');
      
      if (superAdmin) {
        console.log('✅ Super admin found');
        user = superAdmin;
        isTenantUser = false;
      }
    } catch (err) {
      console.log('⚠️  Error checking super admin:', err.message);
    }
    
    // Step 2: If not super admin and companyId provided, check specific company database
    if (!user && companyId) {
      console.log(`🔍 Checking specific company database: ${companyId}`);
      const CompanyRegistry = await getCompanyRegistry();
      
      const company = await CompanyRegistry.findOne({
        companyId: companyId,
        status: 'active',
        databaseStatus: 'active'
      });
      
      if (company) {
        try {
          console.log(`🏢 Authenticating against: ${company.companyName} (${company.tenantDatabaseName})`);
          tenantConnection = await getTenantConnection(company.tenantDatabaseName);
          const TenantUser = tenantConnection.model('User', TenantUserSchema);
          
          const tenantUser = await TenantUser.findOne({ email }).select('+password');
          
          if (tenantUser) {
            console.log(`✅ User found in ${company.companyName}`);
            user = tenantUser;
            isTenantUser = true;
            userCompany = company;
          } else {
            // User not found in the selected company
            console.log(`❌ User ${email} not found in company ${company.companyName}`);
            if (tenantConnection) await tenantConnection.close();
            return res.status(401).json({
              success: false,
              message: `User not found in ${company.companyName}. Please select the correct company.`
            });
          }
        } catch (tenantError) {
          console.error(`⚠️  Error checking ${company.companyName}:`, tenantError.message);
          if (tenantConnection) await tenantConnection.close();
          return res.status(500).json({
            success: false,
            message: 'Error accessing company database'
          });
        }
      } else {
        console.log('⚠️  Company not found or inactive');
        return res.status(404).json({
          success: false,
          message: 'Company not found or inactive'
        });
      }
    }
    
    // Step 3: If still not found and no companyId, check all companies (fallback)
    if (!user && !companyId) {
      console.log('🔍 Checking all company databases...');
      const CompanyRegistry = await getCompanyRegistry();
      
      const companies = await CompanyRegistry.find({
        status: 'active',
        databaseStatus: 'active'
      });
      
      console.log(`📊 Found ${companies.length} active companies`);
      
      for (const company of companies) {
        try {
          console.log(`🔍 Checking company: ${company.companyName}`);
          tenantConnection = await getTenantConnection(company.tenantDatabaseName);
          const TenantUser = tenantConnection.model('User', TenantUserSchema);
          
          const tenantUser = await TenantUser.findOne({ email }).select('+password');
          
          if (tenantUser) {
            console.log(`✅ User found in ${company.companyName}`);
            user = tenantUser;
            isTenantUser = true;
            userCompany = company;
            break;
          }
        } catch (tenantError) {
          console.error(`⚠️  Error checking ${company.companyName}:`, tenantError.message);
          continue;
        }
      }
    }

    if (!user) {
      console.log('❌ User not found for email:', email);
      if (tenantConnection) await tenantConnection.close();
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if password matches
    console.log('🔍 Comparing password for user:', user.email);
    console.log('🔍 Password provided:', password);
    console.log('🔍 User has password field:', !!user.password);
    const isMatch = await user.comparePassword(password);
    console.log('🔍 Password match result:', isMatch);

    if (!isMatch) {
      console.log('❌ Password mismatch for user:', user.email);
      if (tenantConnection) await tenantConnection.close();
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      if (tenantConnection) await tenantConnection.close();
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated'
      });
    }

    // Update last login and first login flag
    user.lastLogin = Date.now();
    
    // Check if this is first login
    const isFirstLogin = user.isFirstLogin;
    if (isFirstLogin) {
      user.isFirstLogin = false;
    }
    
    await user.save();

    // Close tenant connection if used
    if (tenantConnection) {
      await tenantConnection.close();
    }

    // Generate token with additional company info for tenant users
    const tokenPayload = {
      userId: user._id,
      email: user.email,
      role: user.role
    };
    
    if (isTenantUser && userCompany) {
      tokenPayload.companyId = userCompany.companyId;
      tokenPayload.companyCode = userCompany.companyCode;
      tokenPayload.tenantDatabaseName = userCompany.tenantDatabaseName;
    }

    const token = generateToken(user._id, tokenPayload);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          userId: user._id,
          email: user.email,
          role: user.role,
          employee: user.employeeId,
          isFirstLogin: isFirstLogin,
          mustChangePassword: user.mustChangePassword,
          themePreference: user.themePreference || 'dark',
          firstName: user.firstName,
          lastName: user.lastName,
          // Add company info for tenant users
          ...(isTenantUser && userCompany ? {
            companyId: userCompany.companyId,
            companyName: userCompany.companyName,
            companyCode: userCompany.companyCode
          } : {})
        },
        token
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    if (tenantConnection) {
      await tenantConnection.close();
    }
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('employeeId');

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update password
// @route   PUT /api/auth/updatepassword
// @access  Private
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate new password
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }

    const user = await User.findById(req.user.id).select('+password');

    // Check current password
    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password and clear mustChangePassword flag
    user.password = newPassword;
    user.mustChangePassword = false;
    user.passwordChangedAt = Date.now();
    await user.save();

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Password updated successfully',
      data: { token }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Admin reset user password
// @route   PUT /api/auth/admin/reset-password/:userId
// @access  Private/Admin
exports.adminResetPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword, mustChangePassword } = req.body;

    console.log('🔄 Admin reset password request for user ID:', userId);

    // Validate new password
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }

    // Check if tenant connection exists
    if (!req.tenant || !req.tenant.connection) {
      console.error('❌ No tenant connection found');
      return res.status(400).json({
        success: false,
        message: 'Tenant connection not found'
      });
    }

    const tenantConnection = req.tenant.connection;
    const TenantUserSchema = require('../models/tenant/TenantUser');
    const TenantUser = tenantConnection.model('User', TenantUserSchema);

    console.log('✅ Tenant connection established');

    // Find the user to reset password (must select password field)
    const user = await TenantUser.findById(userId).select('+password');

    if (!user) {
      console.error('❌ User not found with ID:', userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ User found:', user.email);

    // Update password
    user.password = newPassword;
    user.mustChangePassword = mustChangePassword !== undefined ? mustChangePassword : true;
    user.passwordChangedAt = Date.now();
    user.isFirstLogin = true;
    
    console.log('💾 Saving user with new password...');
    await user.save();
    console.log('✅ Password reset successful');

    res.status(200).json({
      success: true,
      message: `Password reset successfully for ${user.email}`,
      data: {
        userId: user._id,
        email: user.email,
        mustChangePassword: user.mustChangePassword
      }
    });
  } catch (error) {
    console.error('❌ Error resetting password:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: `Failed to reset password: ${error.message}`
    });
  }
};

// @desc    Google OAuth Login
// @route   POST /api/auth/google
// @access  Public
exports.googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: 'Google credential is required'
      });
    }

    // Verify Google token
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Google token'
      });
    }

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Check if user exists with this email
    let user = await User.findOne({ email }).populate('employeeId');

    if (!user) {
      // User doesn't exist - reject login
      return res.status(404).json({
        success: false,
        message: 'No account found with this email. Please contact your administrator to create an account.'
      });
    }

    // User exists - update Google info if needed
    if (!user.googleId) {
      user.googleId = googleId;
      user.authProvider = 'google';
      user.profilePicture = picture;
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated'
      });
    }

    // Update last login
    user.lastLogin = Date.now();
    const isFirstLogin = user.isFirstLogin;
    if (isFirstLogin) {
      user.isFirstLogin = false;
    }
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          employee: user.employeeId,
          isFirstLogin: isFirstLogin,
          mustChangePassword: user.mustChangePassword,
          themePreference: user.themePreference || 'dark',
          profilePicture: user.profilePicture
        },
        token
      }
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Google login failed'
    });
  }
};

// @desc    Get list of active companies for login selection
// @route   GET /api/auth/companies
// @access  Public
exports.getActiveCompanies = async (req, res) => {
  try {
    // Connect to global database
    const { connectGlobalDB } = require('../config/database.config');
    const globalConnection = await connectGlobalDB();
    
    // Get CompanyRegistry model
    const companyRegistrySchema = require('../models/global/CompanyRegistry');
    const CompanyRegistry = globalConnection.model('CompanyRegistry', companyRegistrySchema);
    
    // Fetch companies from CompanyRegistry
    const registryCompanies = await CompanyRegistry.find({
      status: 'active'
    })
    .select('companyId companyName companyCode tenantDatabaseName status subscription')
    .sort({ companyName: 1 })
    .lean();

    res.status(200).json({
      success: true,
      data: registryCompanies
    });
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching companies'
    });
  }
};
