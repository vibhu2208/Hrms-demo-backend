/**
 * Contract Workflow Service
 * Handles automatic contract creation for contract-requiring employment types
 */

const { getTenantModel } = require('../middlewares/tenantMiddleware');
const emailService = require('./emailService');

class ContractWorkflowService {
  /**
   * Employment types that require contracts
   */
  static CONTRACT_REQUIRING_TYPES = ['rate-based', 'hourly-based', 'contract-based', 'deliverable-based'];

  /**
   * Check if employment type requires a contract
   * @param {string} employmentType - Employment type to check
   * @returns {boolean} - True if contract is required
   */
  static requiresContract(employmentType) {
    return this.CONTRACT_REQUIRING_TYPES.includes(employmentType);
  }

  /**
   * Handle employee creation with contract-requiring employment type
   * @param {Object} employee - Employee object
   * @param {Object} tenantConnection - Tenant database connection
   * @param {Object} createdBy - User who created the employee
   */
  static async handleEmployeeCreation(employee, tenantConnection, createdBy) {
    try {
      if (!this.requiresContract(employee.employmentType)) {
        return { success: true, message: 'No contract required' };
      }

      console.log(`🔄 Creating contract workflow for employee ${employee.firstName} ${employee.lastName} with employment type: ${employee.employmentType}`);

      // Set employee status to contract-pending
      employee.status = 'contract-pending';
      employee.hasActiveContract = false;
      await employee.save();

      // Create draft contract
      const contract = await this.createDraftContract(employee, tenantConnection, createdBy);

      // Send notifications
      await this.sendContractPendingNotifications(employee, contract, tenantConnection);

      return {
        success: true,
        message: 'Contract workflow initiated',
        contractId: contract._id
      };
    } catch (error) {
      console.error('Error handling employee creation contract workflow:', error);
      throw error;
    }
  }

  /**
   * Handle employment type change
   * @param {Object} employee - Employee object
   * @param {string} oldEmploymentType - Previous employment type
   * @param {string} newEmploymentType - New employment type
   * @param {Object} tenantConnection - Tenant database connection
   * @param {Object} updatedBy - User who updated the employee
   */
  static async handleEmploymentTypeChange(employee, oldEmploymentType, newEmploymentType, tenantConnection, updatedBy) {
    try {
      const oldRequiresContract = this.requiresContract(oldEmploymentType);
      const newRequiresContract = this.requiresContract(newEmploymentType);

      // If changing from non-contract to contract type
      if (!oldRequiresContract && newRequiresContract) {
        console.log(`🔄 Employment type changed to contract-requiring: ${newEmploymentType}`);
        
        // Set employee status to contract-pending
        employee.status = 'contract-pending';
        employee.hasActiveContract = false;
        await employee.save();

        // Create draft contract
        const contract = await this.createDraftContract(employee, tenantConnection, updatedBy);

        // Send notifications
        await this.sendContractPendingNotifications(employee, contract, tenantConnection);

        return {
          success: true,
          message: 'Contract workflow initiated for employment type change',
          contractId: contract._id
        };
      }

      // If changing from contract to non-contract type
      if (oldRequiresContract && !newRequiresContract) {
        console.log(`🔄 Employment type changed from contract-requiring to regular: ${newEmploymentType}`);
        
        // Update employee status to active
        employee.status = 'active';
        employee.hasActiveContract = false;
        employee.contractId = null;
        await employee.save();

        // Terminate any existing contracts
        await this.terminateExistingContracts(employee, tenantConnection, updatedBy);

        return {
          success: true,
          message: 'Contract workflow terminated for employment type change'
        };
      }

      return { success: true, message: 'No contract workflow changes needed' };
    } catch (error) {
      console.error('Error handling employment type change:', error);
      throw error;
    }
  }

  /**
   * Create draft contract for employee
   * @param {Object} employee - Employee object
   * @param {Object} tenantConnection - Tenant database connection
   * @param {Object} createdBy - User creating the contract
   * @returns {Object} - Created contract
   */
  static async createDraftContract(employee, tenantConnection, createdBy) {
    try {
      const contractSchema = require('../models/tenant/Contract');
      const Contract = getTenantModel(tenantConnection, 'Contract', contractSchema);

      // Generate contract number
      const contractNumber = await this.generateContractNumber(Contract);

      // Map employment type to contract type
      const contractTypeMap = {
        'rate-based': 'rate-based',
        'hourly-based': 'hourly-based',
        'contract-based': 'fixed-deliverable',
        'deliverable-based': 'fixed-deliverable'
      };

      const contractType = contractTypeMap[employee.employmentType] || 'fixed-deliverable';

      // Calculate contract dates (default 1 year)
      const startDate = employee.joiningDate || new Date();
      const endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);

      // Create contract data
      const contractData = {
        employeeId: employee._id,
        employeeCode: employee.employeeCode,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        employeeEmail: employee.email,
        contractType: contractType,
        contractNumber: contractNumber,
        title: `${contractType.replace('-', ' ').toUpperCase()} Contract - ${employee.designation}`,
        description: `Auto-generated contract for ${employee.firstName} ${employee.lastName} (${employee.employmentType} employment)`,
        startDate: startDate,
        endDate: endDate,
        duration: 365, // 1 year in days
        paymentTerms: 'As per company policy',
        invoiceCycle: 'monthly',
        isRenewable: true,
        autoRenew: false,
        renewalReminderDays: 30,
        status: 'draft',
        approvalStatus: 'pending',
        createdBy: createdBy._id || createdBy.id,
        notes: `Contract created automatically due to employment type: ${employee.employmentType}`
      };

      // Add type-specific fields
      if (contractType === 'rate-based') {
        contractData.rateAmount = employee.salary?.total || 0;
        contractData.ratePeriod = 'monthly';
      } else if (contractType === 'hourly-based') {
        contractData.hourlyRate = 0; // To be filled by admin
        contractData.estimatedHours = 160; // Default 40 hours/week * 4 weeks
        contractData.maxHoursPerWeek = 40;
      } else if (contractType === 'fixed-deliverable') {
        contractData.totalAmount = employee.salary?.total || 0;
        contractData.deliverables = [{
          description: 'To be defined by admin',
          dueDate: endDate,
          status: 'pending'
        }];
      }

      // Create contract
      const contract = await Contract.create(contractData);

      // Update employee with contract reference
      employee.contractId = contract._id;
      await employee.save();

      console.log(`✅ Draft contract created: ${contract.contractNumber} for ${employee.firstName} ${employee.lastName}`);

      return contract;
    } catch (error) {
      console.error('Error creating draft contract:', error);
      throw error;
    }
  }

  /**
   * Generate unique contract number
   * @param {Object} Contract - Contract model
   * @returns {string} - Generated contract number
   */
  static async generateContractNumber(Contract) {
    const year = new Date().getFullYear();
    const prefix = `CON-${year}-`;
    
    // Find the latest contract number for this year
    const latestContract = await Contract.findOne({
      contractNumber: { $regex: `^${prefix}` }
    }).sort({ contractNumber: -1 });
    
    let nextNumber = 1;
    if (latestContract) {
      const lastNumber = parseInt(latestContract.contractNumber.split('-').pop());
      nextNumber = lastNumber + 1;
    }
    
    return `${prefix}${String(nextNumber).padStart(4, '0')}`;
  }

  /**
   * Send notifications about contract pending status
   * @param {Object} employee - Employee object
   * @param {Object} contract - Contract object
   * @param {Object} tenantConnection - Tenant database connection
   */
  static async sendContractPendingNotifications(employee, contract, tenantConnection) {
    try {
      // Get admin users to notify
      const tenantUserSchema = require('../models/tenant/TenantUser');
      const TenantUser = getTenantModel(tenantConnection, 'TenantUser', tenantUserSchema);

      const adminUsers = await TenantUser.find({
        role: { $in: ['admin', 'company_admin'] },
        isActive: true
      });

      // Send email to admins
      const adminEmails = adminUsers.map(user => user.email).filter(Boolean);
      
      if (adminEmails.length > 0) {
        const emailSubject = `Contract Approval Required - ${employee.firstName} ${employee.lastName}`;
        const emailBody = this.generateContractPendingEmailBody(employee, contract);

        for (const email of adminEmails) {
          try {
            await emailService.sendEmail({
              to: email,
              subject: emailSubject,
              html: emailBody
            });
          } catch (emailError) {
            console.error(`Failed to send contract pending notification to ${email}:`, emailError);
          }
        }

        console.log(`✅ Contract pending notifications sent to ${adminEmails.length} admin(s)`);
      }

      // Send email to employee
      try {
        const employeeEmailSubject = `Contract Processing - ${contract.contractNumber}`;
        const employeeEmailBody = this.generateEmployeeContractEmailBody(employee, contract);

        await emailService.sendEmail({
          to: employee.email,
          subject: employeeEmailSubject,
          html: employeeEmailBody
        });

        console.log(`✅ Contract processing notification sent to employee: ${employee.email}`);
      } catch (emailError) {
        console.error(`Failed to send contract notification to employee ${employee.email}:`, emailError);
      }

    } catch (error) {
      console.error('Error sending contract pending notifications:', error);
      // Don't throw error as this is not critical for the workflow
    }
  }

  /**
   * Generate email body for admin contract approval notification
   * @param {Object} employee - Employee object
   * @param {Object} contract - Contract object
   * @returns {string} - HTML email body
   */
  static generateContractPendingEmailBody(employee, contract) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #ff6b35; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
          .content { background-color: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
          .detail-row { padding: 10px 0; border-bottom: 1px solid #eee; }
          .detail-label { font-weight: bold; display: inline-block; width: 150px; }
          .button { display: inline-block; padding: 10px 20px; background-color: #ff6b35; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
          .urgent { background-color: #dc3545; color: white; padding: 10px; border-radius: 5px; margin-bottom: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">🔔 Contract Approval Required</h2>
          </div>
          
          <div class="urgent">
            <strong>ACTION REQUIRED:</strong> A new employee requires contract approval before they can be activated.
          </div>
          
          <div class="content">
            <p>A new employee with a contract-requiring employment type has been added to the system and needs admin approval:</p>
            
            <div class="detail-row">
              <span class="detail-label">Employee Name:</span>
              <span>${employee.firstName} ${employee.lastName}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Employee Code:</span>
              <span>${employee.employeeCode || 'Pending'}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Email:</span>
              <span>${employee.email}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Designation:</span>
              <span>${employee.designation}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Employment Type:</span>
              <span style="color: #ff6b35; font-weight: bold;">${employee.employmentType.replace('-', ' ').toUpperCase()}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Department:</span>
              <span>${employee.department || 'N/A'}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Contract Number:</span>
              <span>${contract.contractNumber}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Contract Type:</span>
              <span>${contract.contractType.replace('-', ' ').toUpperCase()}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Current Status:</span>
              <span style="color: #ff6b35; font-weight: bold;">CONTRACT PENDING</span>
            </div>
            
            <p style="margin-top: 20px;">
              <strong>Next Steps:</strong>
            </p>
            <ul>
              <li>Review the employee details and contract terms</li>
              <li>Update contract specifics (rates, deliverables, terms)</li>
              <li>Approve or reject the contract</li>
              <li>Employee will be activated upon contract approval</li>
            </ul>
            
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/contracts/${contract._id}" class="button">
              Review & Approve Contract
            </a>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate email body for employee contract notification
   * @param {Object} employee - Employee object
   * @param {Object} contract - Contract object
   * @returns {string} - HTML email body
   */
  static generateEmployeeContractEmailBody(employee, contract) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4f46e5; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
          .content { background-color: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
          .detail-row { padding: 10px 0; border-bottom: 1px solid #eee; }
          .detail-label { font-weight: bold; display: inline-block; width: 150px; }
          .info-box { background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">Welcome to the Team! 🎉</h2>
          </div>
          
          <div class="content">
            <p>Dear ${employee.firstName} ${employee.lastName},</p>
            
            <p>Welcome to our organization! Your employment profile has been created and a contract is being processed for your review.</p>
            
            <div class="detail-row">
              <span class="detail-label">Contract Number:</span>
              <span>${contract.contractNumber}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Employment Type:</span>
              <span>${employee.employmentType.replace('-', ' ').toUpperCase()}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Contract Type:</span>
              <span>${contract.contractType.replace('-', ' ').toUpperCase()}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Current Status:</span>
              <span style="color: #ff9800; font-weight: bold;">PENDING APPROVAL</span>
            </div>
            
            <div class="info-box">
              <h4 style="margin-top: 0;">What happens next?</h4>
              <ol>
                <li>Your contract is currently being reviewed by our admin team</li>
                <li>You will receive another email once the contract is approved</li>
                <li>Your employee account will be activated after contract approval</li>
                <li>You'll receive login credentials and onboarding information</li>
              </ol>
            </div>
            
            <p>If you have any questions about your contract or employment, please contact HR at <a href="mailto:hr@company.com">hr@company.com</a>.</p>
            
            <p>We look forward to working with you!</p>
            
            <p>Best regards,<br>HR Team</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Terminate existing contracts for employee
   * @param {Object} employee - Employee object
   * @param {Object} tenantConnection - Tenant database connection
   * @param {Object} terminatedBy - User terminating the contracts
   */
  static async terminateExistingContracts(employee, tenantConnection, terminatedBy) {
    try {
      const contractSchema = require('../models/tenant/Contract');
      const Contract = getTenantModel(tenantConnection, 'Contract', contractSchema);

      const activeContracts = await Contract.find({
        employeeId: employee._id,
        status: { $in: ['draft', 'active', 'pending-renewal'] }
      });

      for (const contract of activeContracts) {
        contract.status = 'terminated';
        contract.terminationDate = new Date();
        contract.terminationReason = 'Employment type changed to non-contract type';
        contract.terminatedBy = terminatedBy._id || terminatedBy.id;
        await contract.save();

        console.log(`✅ Terminated contract ${contract.contractNumber} due to employment type change`);
      }
    } catch (error) {
      console.error('Error terminating existing contracts:', error);
      throw error;
    }
  }
}

module.exports = ContractWorkflowService;
