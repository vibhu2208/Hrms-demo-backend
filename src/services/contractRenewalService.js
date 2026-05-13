/**
 * Contract Renewal Alert Service
 * Manages contract renewal notifications and alerts
 */

const tenantConnectionManager = require('../config/tenantConnection');
const emailService = require('./emailService');

class ContractRenewalService {
  /**
   * Check for contracts requiring renewal notifications
   * @param {string} clientId - Tenant ID
   */
  async checkContractRenewals(clientId) {
    try {
      const tenantConnection = await tenantConnectionManager.getTenantConnection(clientId);
      
      const contractSchema = require('../models/tenant/Contract');
      const Contract = tenantConnection.model('Contract', contractSchema);
      
      // Find contracts that need renewal notification
      const today = new Date();
      const contractsNeedingNotification = await Contract.find({
        status: 'active',
        isRenewable: true,
        renewalNotificationSent: false,
        endDate: { $exists: true }
      });
      
      const notifications = [];
      
      for (const contract of contractsNeedingNotification) {
        const daysUntilExpiry = Math.ceil((contract.endDate - today) / (1000 * 60 * 60 * 24));
        
        // Check if notification should be sent
        if (daysUntilExpiry <= contract.renewalReminderDays && daysUntilExpiry > 0) {
          // Send notification
          await this.sendRenewalNotification(contract, daysUntilExpiry, clientId);
          
          // Mark notification as sent
          contract.renewalNotificationSent = true;
          contract.renewalNotificationDate = new Date();
          await contract.save();
          
          notifications.push({
            contractId: contract._id,
            contractNumber: contract.contractNumber,
            employeeName: contract.employeeName,
            daysUntilExpiry
          });
        }
      }
      
      return {
        success: true,
        notificationsSent: notifications.length,
        notifications
      };
    } catch (error) {
      console.error('Error checking contract renewals:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Send renewal notification
   * @param {Object} contract - Contract object
   * @param {number} daysUntilExpiry - Days until contract expires
   * @param {string} clientId - Tenant ID
   */
  async sendRenewalNotification(contract, daysUntilExpiry, clientId) {
    try {
      const tenantConnection = await tenantConnectionManager.getTenantConnection(clientId);
      
      const tenantUserSchema = require('../models/tenant/TenantUser');
      const TenantUser = tenantConnection.model('TenantUser', tenantUserSchema);
      
      // Get HR/Admin users to notify
      const hrUsers = await TenantUser.find({
        role: { $in: ['hr', 'admin'] },
        isActive: true
      });
      
      // Create notification content
      const emailSubject = `Contract Renewal Alert: ${contract.contractNumber}`;
      const emailBody = this.generateRenewalEmailBody(contract, daysUntilExpiry);
      
      // Send emails to HR/Admin users
      const emailPromises = hrUsers.map(user => 
        emailService.sendEmail({
          to: user.email,
          subject: emailSubject,
          html: emailBody
        }).catch(err => {
          console.error(`Failed to send renewal alert to ${user.email}:`, err);
          return { error: err.message };
        })
      );
      
      await Promise.all(emailPromises);
      
      // Create in-app notification
      const notificationSchema = require('../models/Notification');
      const Notification = tenantConnection.model('Notification', notificationSchema);
      
      const notificationPromises = hrUsers.map(user =>
        Notification.create({
          userId: user._id,
          title: 'Contract Renewal Required',
          message: `Contract ${contract.contractNumber} for ${contract.employeeName} expires in ${daysUntilExpiry} days`,
          type: 'contract-renewal',
          priority: daysUntilExpiry <= 7 ? 'high' : 'medium',
          metadata: {
            contractId: contract._id,
            contractNumber: contract.contractNumber,
            employeeId: contract.employeeId,
            employeeName: contract.employeeName,
            expiryDate: contract.endDate,
            daysUntilExpiry
          }
        }).catch(err => {
          console.error(`Failed to create notification for ${user.email}:`, err);
          return { error: err.message };
        })
      );
      
      await Promise.all(notificationPromises);
      
      console.log(`✅ Renewal notification sent for contract ${contract.contractNumber}`);
      
      return true;
    } catch (error) {
      console.error('Error sending renewal notification:', error);
      throw error;
    }
  }
  
  /**
   * Generate renewal email body
   * @param {Object} contract - Contract object
   * @param {number} daysUntilExpiry - Days until contract expires
   * @returns {string} HTML email body
   */
  generateRenewalEmailBody(contract, daysUntilExpiry) {
    const urgencyClass = daysUntilExpiry <= 7 ? 'urgent' : 'warning';
    const urgencyText = daysUntilExpiry <= 7 ? 'URGENT' : 'REMINDER';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 5px;
            margin-bottom: 20px;
          }
          .urgent {
            background-color: #dc3545;
            color: white;
          }
          .warning {
            background-color: #ffc107;
            color: #000;
          }
          .content {
            background-color: #fff;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 5px;
          }
          .detail-row {
            padding: 10px 0;
            border-bottom: 1px solid #eee;
          }
          .detail-label {
            font-weight: bold;
            display: inline-block;
            width: 150px;
          }
          .footer {
            margin-top: 20px;
            padding: 20px;
            background-color: #f8f9fa;
            border-radius: 5px;
            font-size: 12px;
            color: #666;
          }
          .button {
            display: inline-block;
            padding: 10px 20px;
            background-color: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 15px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header ${urgencyClass}">
            <h2 style="margin: 0;">${urgencyText}: Contract Renewal Required</h2>
          </div>
          
          <div class="content">
            <p>This is an automated reminder that the following contract is expiring soon and requires renewal action:</p>
            
            <div class="detail-row">
              <span class="detail-label">Contract Number:</span>
              <span>${contract.contractNumber}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Contract Title:</span>
              <span>${contract.title}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Employee Name:</span>
              <span>${contract.employeeName}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Employee Code:</span>
              <span>${contract.employeeCode}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Contract Type:</span>
              <span>${contract.contractType.replace('-', ' ').toUpperCase()}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Start Date:</span>
              <span>${new Date(contract.startDate).toLocaleDateString()}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Expiry Date:</span>
              <span style="color: #dc3545; font-weight: bold;">${new Date(contract.endDate).toLocaleDateString()}</span>
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Days Until Expiry:</span>
              <span style="color: #dc3545; font-weight: bold;">${daysUntilExpiry} days</span>
            </div>
            
            ${contract.autoRenew ? `
              <div class="detail-row">
                <span class="detail-label">Auto-Renewal:</span>
                <span style="color: #28a745;">Enabled</span>
              </div>
            ` : ''}
            
            <p style="margin-top: 20px;">
              <strong>Action Required:</strong> Please review this contract and take appropriate action to either:
            </p>
            <ul>
              <li>Renew the contract with updated terms</li>
              <li>Extend the current contract period</li>
              <li>Terminate the contract if no longer needed</li>
            </ul>
            
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/contracts/${contract._id}" class="button">
              View Contract Details
            </a>
          </div>
          
          <div class="footer">
            <p>This is an automated notification from the HRMS Contract Management System.</p>
            <p>Please do not reply to this email. For support, contact your system administrator.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  
  /**
   * Get contracts expiring in specific period
   * @param {string} clientId - Tenant ID
   * @param {number} days - Number of days to look ahead
   */
  async getExpiringContracts(clientId, days = 30) {
    try {
      const tenantConnection = await tenantConnectionManager.getTenantConnection(clientId);
      
      const contractSchema = require('../models/tenant/Contract');
      const Contract = tenantConnection.model('Contract', contractSchema);
      
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      
      const expiringContracts = await Contract.find({
        status: 'active',
        endDate: {
          $gte: today,
          $lte: futureDate
        }
      }).sort({ endDate: 1 });
      
      return {
        success: true,
        count: expiringContracts.length,
        contracts: expiringContracts.map(contract => ({
          id: contract._id,
          contractNumber: contract.contractNumber,
          title: contract.title,
          employeeName: contract.employeeName,
          employeeCode: contract.employeeCode,
          contractType: contract.contractType,
          endDate: contract.endDate,
          daysUntilExpiry: Math.ceil((contract.endDate - today) / (1000 * 60 * 60 * 24)),
          isRenewable: contract.isRenewable,
          autoRenew: contract.autoRenew
        }))
      };
    } catch (error) {
      console.error('Error getting expiring contracts:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Auto-renew contracts that are set for auto-renewal
   * @param {string} clientId - Tenant ID
   */
  async processAutoRenewals(clientId) {
    try {
      const tenantConnection = await tenantConnectionManager.getTenantConnection(clientId);
      
      const contractSchema = require('../models/tenant/Contract');
      const Contract = tenantConnection.model('Contract', contractSchema);
      
      const today = new Date();
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      
      // Find contracts that should auto-renew
      const contractsToRenew = await Contract.find({
        status: 'active',
        isRenewable: true,
        autoRenew: true,
        endDate: {
          $gte: today,
          $lte: threeDaysFromNow
        }
      });
      
      const renewed = [];
      
      for (const contract of contractsToRenew) {
        // Calculate new end date (extend by same duration)
        const duration = contract.duration || 365; // Default to 1 year
        const newEndDate = new Date(contract.endDate);
        newEndDate.setDate(newEndDate.getDate() + duration);
        
        // Renew contract (using system as the renewedBy user)
        await contract.renewContract(
          newEndDate,
          null, // System renewal
          'Automatically renewed based on contract settings'
        );
        
        renewed.push({
          contractId: contract._id,
          contractNumber: contract.contractNumber,
          employeeName: contract.employeeName,
          oldEndDate: contract.endDate,
          newEndDate: newEndDate
        });
        
        console.log(`✅ Auto-renewed contract ${contract.contractNumber}`);
      }
      
      return {
        success: true,
        renewedCount: renewed.length,
        renewed
      };
    } catch (error) {
      console.error('Error processing auto-renewals:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Update expired contracts status
   * @param {string} clientId - Tenant ID
   */
  async updateExpiredContracts(clientId) {
    try {
      const tenantConnection = await tenantConnectionManager.getTenantConnection(clientId);
      
      const contractSchema = require('../models/tenant/Contract');
      const tenantEmployeeSchema = require('../models/tenant/TenantEmployee');
      
      const Contract = tenantConnection.model('Contract', contractSchema);
      const TenantEmployee = tenantConnection.model('TenantEmployee', tenantEmployeeSchema);
      
      const today = new Date();
      
      // Find contracts that have expired
      const expiredContracts = await Contract.find({
        status: 'active',
        endDate: { $lt: today }
      });
      
      const updated = [];
      
      for (const contract of expiredContracts) {
        contract.status = 'expired';
        await contract.save();
        
        // Update employee status
        const employee = await TenantEmployee.findById(contract.employeeId);
        if (employee) {
          employee.hasActiveContract = false;
          await employee.save();
        }
        
        updated.push({
          contractId: contract._id,
          contractNumber: contract.contractNumber,
          employeeName: contract.employeeName
        });
        
        console.log(`📅 Contract ${contract.contractNumber} marked as expired`);
      }
      
      return {
        success: true,
        updatedCount: updated.length,
        updated
      };
    } catch (error) {
      console.error('Error updating expired contracts:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new ContractRenewalService();
