/**
 * Employee Creation Service
 * Handles conversion of onboarding candidates to employees
 */

const { getTenantModel } = require('../middlewares/tenantMiddleware');
const { getTenantConnection } = require('../config/database.config');
const TenantEmployeeSchema = require('../models/tenant/TenantEmployee');

// Create a new schema instance to avoid modifying the shared schema
const employeeSchema = TenantEmployeeSchema.clone();
// Collection is now set in the schema itself
const TenantUserSchema = require('../models/tenant/TenantUser');
const bcrypt = require('bcryptjs');
const { sendEmail } = require('./emailService');
const mongoose = require('mongoose');
const ContractWorkflowService = require('./contractWorkflowService');

class EmployeeCreationService {
  /**
   * Complete onboarding and create employee record
   * @param {String} onboardingId - Onboarding record ID
   * @param {Object} tenantConnection - Tenant database connection
   * @param {Object} additionalData - Additional employee data
   */
  async completeOnboardingAndCreateEmployee(onboardingId, tenantConnection, additionalData = {}) {
    try {
      const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
      const Candidate = getTenantModel(tenantConnection, 'Candidate');

      // Get Employee model using the correct TenantEmployeeSchema
      // Use 'Employee' as model name to match what employee controller expects
      const TenantEmployee = getTenantModel(tenantConnection, 'Employee', employeeSchema);


      // Get Department model for fetching department details
      const Department = getTenantModel(tenantConnection, 'Department');

      // Get onboarding record - don't populate department to avoid errors if it's stored as string
      const onboarding = await Onboarding.findById(onboardingId)
        .populate('applicationId')
        .populate('jobId');

      // Check department type - handle manually to avoid populate errors
      const rawDepartment = onboarding.department;

      // Only populate if department is a valid ObjectId (not a string name)
      if (rawDepartment) {
        if (typeof rawDepartment === 'object' && rawDepartment._id && rawDepartment.name) {
        } else if (mongoose.Types.ObjectId.isValid(rawDepartment) &&
                   (rawDepartment instanceof mongoose.Types.ObjectId ||
                    (typeof rawDepartment === 'string' && rawDepartment.length === 24))) {
          // It's a valid ObjectId, try to populate
          try {
            await onboarding.populate('department');
          } catch (populateError) {
          }
        } else {
        }
      }
      
      if (!onboarding) {
        throw new Error('Onboarding record not found');
      }

      // Check if onboarding is already completed
      if (onboarding.status === 'completed') {
        throw new Error('This onboarding has already been completed');
      }

      // Check documents - NOTE: Document verification should NOT block employee creation
      // Candidates should be moved to employees after onboarding completion regardless of document status
      if (onboarding.documents && onboarding.documents.length > 0) {
        const unverifiedDocs = onboarding.documents.filter(doc => doc.status !== 'verified');
        if (unverifiedDocs.length > 0) {
          console.log(`⚠️ ${unverifiedDocs.length} document(s) not verified, but proceeding with employee creation`);
          // Add warning but don't block - documents can be verified post-employment
        }
      }

      console.log(`🔄 Creating employee from onboarding: ${onboarding.candidateName}`);

      // Generate employee code
      const employeeCode = await this.generateEmployeeCode(tenantConnection);

      // Generate temporary password
      const tempPassword = this.generateTempPassword();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      // Get candidate details for personal information transfer
      const candidate = onboarding.applicationId;
      
      // Get employment type from job posting, fallback to candidate preference, then default
      let employmentType = 'full-time'; // default
      if (onboarding.jobId && onboarding.jobId.employmentType) {
        employmentType = onboarding.jobId.employmentType;
      } else if (candidate && candidate.employmentType) {
        employmentType = candidate.employmentType;
      }

      // Prepare employee data with candidate personal details
      const employeeData = {
        firstName: onboarding.candidateName?.split(' ')[0] || '',
        lastName: onboarding.candidateName?.split(' ').slice(1).join(' ') || '',
        email: onboarding.candidateEmail?.toLowerCase().trim(),
        phone: onboarding.candidatePhone || '',
        employeeCode: employeeCode,
        designation: onboarding.position || '',
        joiningDate: onboarding.joiningDate || new Date(),
        employmentType: employmentType,
        status: 'active',
        isActive: true,
        // Transfer personal details from candidate if available
        ...(candidate && candidate.dateOfBirth ? { dateOfBirth: candidate.dateOfBirth } : {}),
        ...(candidate && candidate.gender ? { gender: candidate.gender } : {}),
        ...(candidate && candidate.bloodGroup ? { bloodGroup: candidate.bloodGroup } : {}),
        ...(candidate && candidate.maritalStatus ? { maritalStatus: candidate.maritalStatus } : {}),
        ...(candidate && candidate.alternatePhone ? { alternatePhone: candidate.alternatePhone } : {}),
        ...(candidate && candidate.address ? { address: candidate.address } : {}),
        ...(candidate && candidate.emergencyContact ? { emergencyContact: candidate.emergencyContact } : {})
      };
      
      // Apply additional data, but exclude department fields to set them manually
      const { department: _dept, departmentId: _deptId, ...safeAdditionalData } = additionalData || {};
      Object.assign(employeeData, safeAdditionalData);

      // Handle department - ensure it's always set correctly
      let departmentId = null;
      let departmentName = null;


      // Try to get department from onboarding.department (populated, ObjectId, or string name)
      if (onboarding.department) {
        if (typeof onboarding.department === 'object' && onboarding.department._id && onboarding.department.name) {
          // Department is populated object
          departmentId = onboarding.department._id;
          departmentName = onboarding.department.name || onboarding.department.departmentName || null;
        } else if (onboarding.department instanceof mongoose.Types.ObjectId ||
                   (mongoose.Types.ObjectId.isValid(onboarding.department) &&
                    typeof onboarding.department === 'string' && onboarding.department.length === 24)) {
          // Department is ObjectId (not populated) - we need to fetch the name
          departmentId = onboarding.department instanceof mongoose.Types.ObjectId ?
                        onboarding.department : new mongoose.Types.ObjectId(onboarding.department);
        } else if (typeof onboarding.department === 'string') {
          // Could be ObjectId string or department name - need to check
          // First check if it's a valid ObjectId
          if (mongoose.Types.ObjectId.isValid(onboarding.department) && onboarding.department.length === 24) {
            // It's a valid ObjectId string
            departmentId = new mongoose.Types.ObjectId(onboarding.department);
          } else {
            // It's a department name string (like "Finance")
            departmentName = onboarding.department.trim();
          }
        }
      }
      
      // Fallback: Try to get department from jobId if available
      if (!departmentId && !departmentName && onboarding.jobId) {
        if (typeof onboarding.jobId === 'object' && onboarding.jobId.department) {
          if (typeof onboarding.jobId.department === 'object' && onboarding.jobId.department._id) {
            departmentId = onboarding.jobId.department._id;
            departmentName = onboarding.jobId.department.name || onboarding.jobId.department.departmentName || null;
          } else if (onboarding.jobId.department instanceof mongoose.Types.ObjectId) {
            departmentId = onboarding.jobId.department;
          } else if (typeof onboarding.jobId.department === 'string') {
            if (mongoose.Types.ObjectId.isValid(onboarding.jobId.department) && onboarding.jobId.department.length === 24) {
              departmentId = new mongoose.Types.ObjectId(onboarding.jobId.department);
            } else {
              departmentName = onboarding.jobId.department.trim();
              console.log('⚠️ Got department name from jobId, will lookup:', departmentName);
            }
          }
        }
      }
      
      // If we have department name but not ID, look it up in Department collection
      if (departmentName && !departmentId && Department) {
        try {
          const departmentDoc = await Department.findOne({ 
            name: { $regex: new RegExp(`^${departmentName}$`, 'i') } 
          });
          if (departmentDoc) {
            departmentId = departmentDoc._id;
            departmentName = departmentDoc.name; // Use the exact name from DB
          } else {
            throw new Error(`Department "${departmentName}" not found in the system. Please ensure the department exists.`);
          }
        } catch (deptError) {
          if (deptError.message.includes('not found')) {
            throw deptError;
          }
          console.warn('⚠️ Failed to lookup department by name:', deptError.message);
          throw deptError;
        }
      }
      
      // If we have departmentId but not name, fetch it
      if (departmentId && !departmentName && Department) {
        try {
          const departmentDoc = await Department.findById(departmentId);
          if (departmentDoc) {
            departmentName = departmentDoc.name || departmentDoc.departmentName || null;
          } else {
            throw new Error(`Department with ID ${departmentId} not found in the system.`);
          }
        } catch (deptError) {
          if (deptError.message.includes('not found')) {
            throw deptError;
          }
          console.warn('⚠️ Failed to fetch department name:', deptError.message);
          throw deptError;
        }
      }
      
      // Set department fields in employee data - CRITICAL: department must be string, departmentId must be ObjectId
      if (departmentId) {
        // Ensure departmentId is a valid ObjectId instance
        if (!(departmentId instanceof mongoose.Types.ObjectId)) {
          try {
            // Validate it's a valid ObjectId format before converting
            if (!mongoose.Types.ObjectId.isValid(departmentId)) {
              throw new Error(`Invalid department ID format: ${departmentId}. Expected ObjectId, got: ${typeof departmentId}`);
            }
            departmentId = new mongoose.Types.ObjectId(departmentId);
          } catch (idError) {
            throw new Error(`Invalid department ID format: ${departmentId}. Expected ObjectId. Error: ${idError.message}`);
          }
        }
        
        // Set departmentId (ObjectId field)
        employeeData.departmentId = departmentId;
        
        // Set department (String field) - MUST be a string, never an ObjectId
        if (departmentName && typeof departmentName === 'string') {
          employeeData.department = departmentName.trim();
        } else if (!departmentName) {
          // If we don't have name but have ID, fetch it
          if (Department) {
            try {
              const deptDoc = await Department.findById(departmentId);
              if (deptDoc) {
                employeeData.department = deptDoc.name || String(departmentId);
              } else {
                employeeData.department = String(departmentId); // Fallback
              }
            } catch (err) {
              employeeData.department = String(departmentId); // Fallback
            }
          } else {
            employeeData.department = String(departmentId); // Fallback
          }
        } else {
          // departmentName exists but is not a string - convert to string
          employeeData.department = String(departmentName);
        }
        
        // Final validation: ensure department is a string
        if (typeof employeeData.department !== 'string') {
          employeeData.department = String(employeeData.department);
        }
        
      } else {
        // If no department found, throw error
        throw new Error('Department is required for employee creation. Please ensure the onboarding record has a valid department assigned.');
      }

      // Handle salary details from offer
      if (onboarding.offer) {
        employeeData.salary = {
          basic: onboarding.offer.salary?.basic || onboarding.offer.salary?.base || 0,
          hra: onboarding.offer.salary?.hra || 0,
          allowances: onboarding.offer.salary?.allowances || 0,
          total: onboarding.offer.offeredCTC || onboarding.offer.salary?.total || 0
        };
      }

      // Validate required fields before creating
      if (!employeeData.email) {
        throw new Error('Employee email is required');
      }
      if (!employeeData.firstName) {
        throw new Error('Employee first name is required');
      }

      // Check if employee with this email already exists
      const existingEmployee = await TenantEmployee.findOne({ email: employeeData.email });
      if (existingEmployee) {
        throw new Error(`Employee with email ${employeeData.email} already exists`);
      }

      // Final validation: Ensure department is a string (not ObjectId)
      if (employeeData.department !== undefined) {
        if (typeof employeeData.department !== 'string') {
          console.warn(`⚠️ Converting department from ${typeof employeeData.department} to string`);
          if (employeeData.department instanceof mongoose.Types.ObjectId) {
            // If it's an ObjectId, we need to fetch the name
            if (Department) {
              try {
                const deptDoc = await Department.findById(employeeData.department);
                employeeData.department = deptDoc ? deptDoc.name : String(employeeData.department);
              } catch (err) {
                employeeData.department = String(employeeData.department);
              }
            } else {
              employeeData.department = String(employeeData.department);
            }
          } else {
            employeeData.department = String(employeeData.department);
          }
        }
        // Ensure it's not empty
        if (!employeeData.department || employeeData.department.trim() === '') {
          delete employeeData.department; // Remove if empty
        }
      }
      
      // Ensure departmentId is ObjectId if set
      if (employeeData.departmentId !== undefined) {
        if (!(employeeData.departmentId instanceof mongoose.Types.ObjectId)) {
          if (mongoose.Types.ObjectId.isValid(employeeData.departmentId)) {
            employeeData.departmentId = new mongoose.Types.ObjectId(employeeData.departmentId);
          } else {
            throw new Error(`Invalid departmentId: ${employeeData.departmentId}. Must be a valid ObjectId.`);
          }
        }
      }


      // Create employee record

      let employee;
      try {
        employee = await TenantEmployee.create(employeeData);
      } catch (createError) {
        console.error('❌ Failed to create employee:', createError);
        throw createError;
      }



      // Handle contract workflow for contract-requiring employment types
      let contractWorkflowResult = null;
      try {
        contractWorkflowResult = await ContractWorkflowService.handleEmployeeCreation(
          employee, 
          tenantConnection, 
          { _id: onboarding.createdBy || null }
        );
        
        if (contractWorkflowResult.success && contractWorkflowResult.contractId) {
        }
      } catch (contractError) {
        console.error('Error in contract workflow during onboarding:', contractError);
        // Don't fail employee creation if contract workflow fails
      }

      // Create user account with 'employee' role
      const TenantUser = getTenantModel(tenantConnection, 'User', TenantUserSchema);
      let userAccount = null;

      try {
        // Check if user account already exists
        const existingUser = await TenantUser.findOne({ email: employee.email.toLowerCase() });
        if (!existingUser) {
          // Create user account with employee role
          userAccount = new TenantUser({
            email: employee.email.toLowerCase(),
            password: tempPassword, // Same password as employee welcome email
            firstName: employee.firstName,
            lastName: employee.lastName,
            role: 'employee',
            phone: employee.phone,
            department: employee.department, // String field - department name
            departmentId: employee.departmentId, // ObjectId field - department reference
            employeeId: employee._id, // Link to employee record
            companyId: tenantConnection.name.split('_')[1], // Extract company ID from tenant DB name
            isFirstLogin: true,
            mustChangePassword: true,
            isActive: true
          });

          await userAccount.save();
        } else {
          console.log(`⚠️ User account already exists for ${employee.email}`);
        }
      } catch (userError) {
        console.warn('⚠️ Failed to create user account:', userError.message);
        // Don't throw - user account creation failure shouldn't stop employee creation
      }

      // Update onboarding status
      onboarding.status = 'completed';
      onboarding.candidateId = employee._id;
      onboarding.completedAt = new Date();
      
      // Add to timeline
      if (!onboarding.timeline) {
        onboarding.timeline = [];
      }
      onboarding.timeline.push({
        stage: 'completed',
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
        notes: 'Onboarding completed - Employee record created'
      });

      await onboarding.save();

      // Update candidate status to 'joined' if candidate exists
      // Try to find candidate by applicationId or candidateId
      let candidateId = null;
      if (onboarding.applicationId) {
        candidateId = onboarding.applicationId._id || onboarding.applicationId;
      } else if (onboarding.candidateId) {
        candidateId = onboarding.candidateId._id || onboarding.candidateId;
      }
      
      // Also try to find by email if no ID is available
      if (!candidateId && onboarding.candidateEmail && Candidate) {
        try {
          const candidateByEmail = await Candidate.findOne({ email: onboarding.candidateEmail });
          if (candidateByEmail) {
            candidateId = candidateByEmail._id;
          }
        } catch (emailSearchError) {
          console.warn('⚠️ Failed to search candidate by email:', emailSearchError.message);
        }
      }
      
      if (candidateId && Candidate) {
        try {
          const candidate = await Candidate.findById(candidateId);
          if (candidate) {
            candidate.stage = 'joined';
            candidate.status = 'joined';
            candidate.finalDecision = 'joined';
            candidate.joinedAt = new Date();
            // Mark candidate as employee and link to employee record
            candidate.isEmployee = true;
            candidate.employeeId = employee._id;
            
            // Add to timeline
            if (!candidate.timeline) {
              candidate.timeline = [];
            }
            candidate.timeline.push({
              action: 'Onboarding Completed',
              description: `Candidate successfully completed onboarding and joined as employee (${employeeCode})`,
              performedBy: additionalData.createdBy,
              timestamp: new Date()
            });
            
            await candidate.save();
          } else {
            console.warn(`⚠️ Candidate with ID ${candidateId} not found`);
          }
        } catch (candidateError) {
          console.warn('⚠️ Failed to update candidate status:', candidateError.message);
          // Don't throw - candidate update failure shouldn't stop employee creation
        }
      } else if (!Candidate) {
        console.warn('⚠️ Candidate model not available - skipping candidate status update');
      }

      // Send welcome email with credentials
      await this.sendWelcomeEmail(employee, tempPassword, onboarding);

      return {
        success: true,
        employee,
        employeeCode,
        userAccount: userAccount ? {
          id: userAccount._id,
          email: userAccount.email,
          role: userAccount.role
        } : null,
        tempPassword, // Only for logging/admin view
        onboarding
      };
    } catch (error) {
      console.error('❌ Error creating employee from onboarding:', error);
      throw error;
    }
  }

  /**
   * Generate unique employee code
   */
  async generateEmployeeCode(tenantConnection) {
    // Use the same Employee model with correct schema
    const TenantEmployee = getTenantModel(tenantConnection, 'Employee', employeeSchema);

    // Get count of existing employees
    const employeeCount = await TenantEmployee.countDocuments();

    // Generate code: EMP + 4-digit number
    const codeNumber = (employeeCount + 1).toString().padStart(4, '0');
    const employeeCode = `EMP${codeNumber}`;

    // Check if code already exists
    const existing = await TenantEmployee.findOne({ employeeCode });
    if (existing) {
      // If exists, use timestamp to make it unique
      return `EMP${Date.now().toString().slice(-6)}`;
    }

    return employeeCode;
  }

  /**
   * Generate temporary password
   */
  generateTempPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * Send welcome email with credentials
   */
  async sendWelcomeEmail(employee, tempPassword, onboarding) {
    try {
      const emailData = {
        to: employee.email,
        subject: 'Welcome to the Team! Your Account Details',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4F46E5;">Welcome ${employee.firstName}!</h2>
            
            <p>Congratulations on completing your onboarding! We're excited to have you join our team.</p>
            
            <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #1F2937;">Your Account Details</h3>
              <p style="margin: 10px 0;"><strong>Employee Code:</strong> ${employee.employeeCode}</p>
              <p style="margin: 10px 0;"><strong>Email:</strong> ${employee.email}</p>
              <p style="margin: 10px 0;"><strong>Temporary Password:</strong> <code style="background: #E5E7EB; padding: 4px 8px; border-radius: 4px;">${tempPassword}</code></p>
              <p style="margin: 10px 0;"><strong>Position:</strong> ${employee.designation}</p>
              <p style="margin: 10px 0;"><strong>Joining Date:</strong> ${new Date(employee.joiningDate).toLocaleDateString()}</p>
            </div>
            
            <div style="background-color: #FEF3C7; padding: 15px; border-left: 4px solid #F59E0B; margin: 20px 0;">
              <p style="margin: 0;"><strong>⚠️ Important:</strong> Please change your password upon first login for security purposes.</p>
            </div>
            
            <h3>Next Steps:</h3>
            <ol>
              <li>Log in to the HRMS portal using your email and temporary password</li>
              <li>Change your password immediately</li>
              <li>Complete your profile information</li>
              <li>Review company policies and guidelines</li>
            </ol>
            
            <p style="margin-top: 30px;">If you have any questions or need assistance, please don't hesitate to contact HR.</p>
            
            <p>Best regards,<br>HR Team</p>
          </div>
        `
      };

      await sendEmail(emailData);
      console.log(`📧 Welcome email sent to ${employee.email}`);
    } catch (error) {
      console.error('Failed to send welcome email:', error.message);
      // Don't throw - email failure shouldn't stop employee creation
    }
  }

  /**
   * Bulk complete onboarding for multiple candidates
   */
  async bulkCompleteOnboarding(onboardingIds, tenantConnection) {
    const results = [];
    const errors = [];

    for (const id of onboardingIds) {
      try {
        const result = await this.completeOnboardingAndCreateEmployee(id, tenantConnection);
        results.push({
          onboardingId: id,
          employeeCode: result.employeeCode,
          email: result.employee.email,
          status: 'success'
        });
      } catch (error) {
        errors.push({
          onboardingId: id,
          error: error.message
        });
      }
    }

    return {
      success: errors.length === 0,
      completed: results.length,
      failed: errors.length,
      results,
      errors
    };
  }

  /**
   * Validate onboarding completion readiness
   */
  async validateOnboardingCompletion(onboardingId, tenantConnection) {
    const Onboarding = getTenantModel(tenantConnection, 'Onboarding');

    // Use the same Employee model with correct schema
    const TenantEmployee = getTenantModel(tenantConnection, 'Employee', employeeSchema);
    
    const onboarding = await Onboarding.findById(onboardingId)
      .populate('department');

    if (!onboarding) {
      return { valid: false, errors: ['Onboarding record not found'] };
    }

    // Check if already completed
    if (onboarding.status === 'completed') {
      return { valid: false, errors: ['This onboarding has already been completed'] };
    }

    const errors = [];
    const warnings = [];

    // Check required fields
    if (!onboarding.candidateEmail) {
      errors.push('Candidate email is required');
    } else {
      // Check if employee with this email already exists
      const existingEmployee = await TenantEmployee.findOne({ 
        email: onboarding.candidateEmail.toLowerCase().trim() 
      });
      if (existingEmployee) {
        errors.push(`Employee with email ${onboarding.candidateEmail} already exists`);
      }
    }
    
    if (!onboarding.candidateName) {
      errors.push('Candidate name is required');
    }
    
    if (!onboarding.position) {
      errors.push('Position/Designation is required');
    }
    
    // Check department - it's required in onboarding schema, but verify it exists
    let departmentResolved = false;
    
    if (onboarding.department) {
      // Department is directly available in onboarding
      departmentResolved = true;
    } else if (onboarding.jobId) {
      // Try to get from jobId if available
      const JobPosting = getTenantModel(tenantConnection, 'JobPosting');
      if (JobPosting) {
        try {
          const job = await JobPosting.findById(onboarding.jobId).populate('department');
          if (job && job.department) {
            // Department exists in job, update onboarding record with department
            const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
            await Onboarding.findByIdAndUpdate(onboardingId, { 
              department: job.department._id 
            });
            departmentResolved = true;
          }
        } catch (jobError) {
          console.warn('⚠️ Could not fetch department from job posting:', jobError.message);
        }
      }
    }
    
    if (!departmentResolved) {
      // Try to assign a default department if available
      const Department = getTenantModel(tenantConnection, 'Department');
      if (Department) {
        try {
          const defaultDept = await Department.findOne({ isActive: true }).sort({ createdAt: 1 });
          if (defaultDept) {
            const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
            await Onboarding.findByIdAndUpdate(onboardingId, { 
              department: defaultDept._id 
            });
            departmentResolved = true;
            warnings.push(`Department was missing - assigned to default department: ${defaultDept.name}`);
            console.log(`⚠️ Assigned default department ${defaultDept.name} to onboarding ${onboardingId}`);
          }
        } catch (deptError) {
          console.warn('⚠️ Could not assign default department:', deptError.message);
        }
      }
      
      if (!departmentResolved) {
        errors.push('Department is required but could not be resolved from job posting or default department');
      }
    }

    // Check documents - NOTE: Document verification should NOT block employee creation
    // Documents can be verified post-employment, so this should only be a warning
    if (onboarding.documents && onboarding.documents.length > 0) {
      const unverifiedDocs = onboarding.documents.filter(doc => doc.status !== 'verified');
      if (unverifiedDocs.length > 0) {
        warnings.push(`${unverifiedDocs.length} document(s) not verified - will be processed post-employment`);
      }
    } else {
      warnings.push('No documents uploaded');
    }

    // Check joining date
    if (!onboarding.joiningDate) {
      warnings.push('Joining date not set - will use current date');
    }

    // Check offer details (warnings only, not blocking)
    if (!onboarding.offer || !onboarding.offer.offeredCTC) {
      warnings.push('Offer details incomplete - salary will be set to 0');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

module.exports = new EmployeeCreationService();
