const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Email service
const { sendEmail } = require('../services/emailService');

// Tenant models utility
const { getTenantModel } = require('../utils/tenantModels');

/**
 * Get user theme preference
 * @route GET /api/user/theme
 * @access Private
 */
exports.getThemePreference = async (req, res) => {
  try {
    // Get tenant connection from middleware
    const tenantConnection = req.tenant.connection;
    const TenantUserSchema = require('../models/tenant/TenantUser');
    const TenantUser = tenantConnection.model('User', TenantUserSchema);
    
    const user = await TenantUser.findById(req.user.id).select('themePreference');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        themePreference: user.themePreference || 'dark'
      }
    });
  } catch (error) {
    console.error('Error fetching theme preference:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch theme preference'
    });
  }
};

/**
 * Update user theme preference
 * @route PUT /api/user/theme
 * @access Private
 */
exports.updateThemePreference = async (req, res) => {
  try {
    const { themePreference } = req.body;

    if (!themePreference) {
      return res.status(400).json({
        success: false,
        message: 'Theme preference is required'
      });
    }

    const validThemes = ['light', 'dark', 'blue', 'green', 'purple', 'orange', 'red', 'teal', 'grey', 'custom'];
    if (!validThemes.includes(themePreference)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid theme preference'
      });
    }

    // Get tenant connection from middleware
    const tenantConnection = req.tenant.connection;
    const TenantUserSchema = require('../models/tenant/TenantUser');
    const TenantUser = tenantConnection.model('User', TenantUserSchema);
    
    const user = await TenantUser.findByIdAndUpdate(
      req.user.id,
      { themePreference },
      { new: true, runValidators: true }
    ).select('themePreference email role');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Theme preference updated successfully',
      data: {
        themePreference: user.themePreference
      }
    });
  } catch (error) {
    console.error('Error updating theme preference:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update theme preference'
    });
  }
};

/**
 * Get user profile
 * @route GET /api/user/profile
 * @access Private
 */
exports.getUserProfile = async (req, res) => {
  try {
    // Get tenant connection from middleware
    const tenantConnection = req.tenant.connection;
    const TenantUserSchema = require('../models/tenant/TenantUser');
    const TenantUser = tenantConnection.model('User', TenantUserSchema);
    
    // Get Department model for population (if available)
    const Department = getTenantModel(tenantConnection, 'Department');
    
    let user;
    if (Department) {
      user = await TenantUser.findById(req.user.id)
        .select('-password')
        .populate({
          path: 'departmentId',
          model: Department
        });
    } else {
      user = await TenantUser.findById(req.user.id)
        .select('-password');
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch user profile'
    });
  }
};

/**
 * @desc Get all users for current tenant (Admin only)
 * @route GET /api/user/all
 * @access Private/Admin
 */
exports.getAllUsers = async (req, res) => {
  try {
    // Get tenant connection from middleware
    const tenantConnection = req.tenant.connection;
    const TenantUserSchema = require('../models/tenant/TenantUser');
    const TenantUser = tenantConnection.model('User', TenantUserSchema);

    // Get Department model for population (if available)
    const Department = getTenantModel(tenantConnection, 'Department');

    // Query users from tenant database
    let users;
    if (Department) {
      users = await TenantUser.find()
        .select('-password')
        .populate({
          path: 'departmentId',
          model: Department,
          select: 'name code'
        })
        .sort({ createdAt: -1 });
    } else {
      users = await TenantUser.find()
        .select('-password')
        .sort({ createdAt: -1 });
    }

    console.log(`📋 Found ${users.length} users for company ${req.tenant.companyId}`);

    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch users'
    });
  }
};

/**
 * @desc Create new user (Admin only)
 * @route POST /api/user/create
 * @access Private/Admin
 */
exports.createUser = async (req, res) => {
  try {
    const {
      email,
      firstName,
      lastName,
      role,
      phone,
      departmentId
    } = req.body;

    // Validate required fields
    if (!email || !firstName || !lastName || !role) {
      return res.status(400).json({
        success: false,
        message: 'Email, first name, last name, and role are required'
      });
    }

    // Validate role
    const validRoles = ['hr', 'admin', 'company_admin', 'manager', 'employee'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be one of: hr, admin, company_admin, manager, employee'
      });
    }

    // Only company_admin can create admin/company_admin users
    if ((role === 'admin' || role === 'company_admin') && req.user.role !== 'company_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only company administrators can create admin users'
      });
    }

    // Get tenant connection from middleware
    const tenantConnection = req.tenant.connection;
    const TenantUserSchema = require('../models/tenant/TenantUser');
    const TenantUser = tenantConnection.model('User', TenantUserSchema);

    // Check if user already exists
    const existingUser = await TenantUser.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Generate temporary password
    const tempPassword = crypto.randomBytes(8).toString('hex');

    // Note: Password will be hashed by the TenantUser model's pre-save hook
    // Do NOT hash it here to avoid double hashing

    // Create user in tenant database
    const newUser = new TenantUser({
      email: email.toLowerCase(),
      password: tempPassword, // Pass plain password - model will hash it
      firstName,
      lastName,
      role,
      phone,
      departmentId,
      companyId: req.tenant.companyId,
      isFirstLogin: true,
      mustChangePassword: true,
      isActive: true
    });

    const savedUser = await newUser.save();

    // Send welcome email with credentials
    let emailSent = false;
    let emailError = null;
    
    // Check if email is configured
    const isEmailConfigured = process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD || 
                               (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    
    if (!isEmailConfigured) {
      console.warn('⚠️ Email not configured - skipping welcome email. Set EMAIL_USER and EMAIL_APP_PASSWORD or SMTP_* environment variables.');
      emailError = new Error('Email service not configured. Please configure EMAIL_USER and EMAIL_APP_PASSWORD or SMTP settings.');
    } else {
      try {
      const frontendUrl = 'http://3.108.172.119:8080';
      const emailData = {
        to: email,
        subject: `Welcome to ${req.tenant.companyName} - Your Account Credentials`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">Welcome to ${req.tenant.companyName}!</h2>
            <p>Your account has been created successfully.</p>

            <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #007bff;">
              <h3 style="margin-top: 0; color: #333;">Your Login Credentials:</h3>
              <p style="margin: 10px 0;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 10px 0;"><strong>Temporary Password:</strong> <code style="background: #fff; padding: 4px 8px; border-radius: 3px; font-family: monospace;">${tempPassword}</code></p>
            </div>

            <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
              <p style="margin: 0;"><strong>⚠️ Important:</strong> Please change your password on first login for security.</p>
            </div>

            <p style="margin: 20px 0;"><strong>Login URL:</strong> <a href="${frontendUrl}" style="color: #007bff; text-decoration: none;">${frontendUrl}</a></p>

            <p>If you have any questions, please contact your administrator.</p>

            <p style="margin-top: 30px;">Best regards,<br><strong>${req.tenant.companyName} Team</strong></p>
          </div>
        `,
        text: `Welcome to ${req.tenant.companyName}!\n\nYour account has been created successfully.\n\nYour Login Credentials:\nEmail: ${email}\nTemporary Password: ${tempPassword}\n\n⚠️ Important: Please change your password on first login for security.\n\nLogin URL: ${frontendUrl}\n\nIf you have any questions, please contact your administrator.\n\nBest regards,\n${req.tenant.companyName} Team`
      };

        console.log(`📧 Attempting to send welcome email to ${email}...`);
        await sendEmail(emailData);
        emailSent = true;
        console.log(`✅ Welcome email sent successfully to ${email}`);
      } catch (err) {
        emailError = err;
        console.error('❌ Error sending welcome email:', err);
        console.error('Email error details:', {
          message: err.message,
          stack: err.stack,
          to: email,
          subject: `Welcome to ${req.tenant.companyName} - Your Account Credentials`
        });
        // Don't fail the user creation if email fails, but log it
      }
    }

    // Return user data (without password)
    const userResponse = savedUser.toObject();
    delete userResponse.password;

    console.log(`👤 New user created: ${email} (${role}) by ${req.user.email}`);

    // Log HR activity
    try {
      const { logUserCreated } = require('../services/hrActivityLogService');
      await logUserCreated(tenantConnection, savedUser, req);
      console.log(`📝 HR activity logged for user creation: ${email}`);
    } catch (logError) {
      console.error('⚠️ Failed to log HR activity for user creation:', logError.message);
    }

    // Build response message based on email status
    let message = 'User created successfully.';
    if (emailSent) {
      message += ' Welcome email sent with credentials.';
    } else if (emailError) {
      message += ` Warning: Email could not be sent (${emailError.message}). User can still login with temporary password.`;
    }

    res.status(201).json({
      success: true,
      message: message,
      data: userResponse,
      emailSent: emailSent,
      emailError: emailError ? emailError.message : null,
      tempPassword: tempPassword // Only for testing - remove in production
    });

  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create user'
    });
  }
};

/**
 * @desc Update user status (active/inactive)
 * @route PUT /api/user/:id/status
 * @access Private/Admin
 */
exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isActive must be a boolean value'
      });
    }

    // Get tenant connection from middleware
    const tenantConnection = req.tenant.connection;
    const TenantUserSchema = require('../models/tenant/TenantUser');
    const TenantUser = tenantConnection.model('User', TenantUserSchema);

    // Prevent deactivating yourself
    if (id === req.user._id.toString() && !isActive) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account'
      });
    }

    // Find user before update to capture previous status
    const existingUser = await TenantUser.findById(id);
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const previousStatus = existingUser.isActive;

    // Find and update user
    const user = await TenantUser.findByIdAndUpdate(
      id,
      { isActive },
      { new: true, runValidators: true }
    ).select('-password');

    console.log(`👤 User status updated: ${user.email} - ${isActive ? 'Active' : 'Inactive'} by ${req.user.email}`);

    // Log HR activity
    try {
      const { logUserStatusChanged } = require('../services/hrActivityLogService');
      await logUserStatusChanged(tenantConnection, user, previousStatus, isActive, req);
      console.log(`📝 HR activity logged for user status change: ${user.email}`);
    } catch (logError) {
      console.error('⚠️ Failed to log HR activity for user status change:', logError.message);
    }

    res.status(200).json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: user
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update user status'
    });
  }
};

/**
 * @desc Delete user
 * @route DELETE /api/user/:id
 * @access Private/Admin
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Get tenant connection from middleware
    const tenantConnection = req.tenant.connection;
    const TenantUserSchema = require('../models/tenant/TenantUser');
    const TenantUser = tenantConnection.model('User', TenantUserSchema);

    // Prevent deleting yourself
    if (id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    // Find user before deletion
    const user = await TenantUser.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deleting company_admin users (only super admin should do this)
    if (user.role === 'company_admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete company administrator. Contact super admin for assistance.'
      });
    }

    // Delete user
    await TenantUser.findByIdAndDelete(id);

    console.log(`👤 User deleted: ${user.email} by ${req.user.email}`);

    // Log HR activity
    try {
      const { logUserDeleted } = require('../services/hrActivityLogService');
      await logUserDeleted(tenantConnection, user, req);
      console.log(`📝 HR activity logged for user deletion: ${user.email}`);
    } catch (logError) {
      console.error('⚠️ Failed to log HR activity for user deletion:', logError.message);
    }

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete user'
    });
  }
};
