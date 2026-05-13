/**
 * Centralized Approval Workflow Engine
 * Handles multi-level approvals, delegation, escalation, and SLA monitoring
 */

class ApprovalEngine {
  /**
   * Create a new approval instance
   */
  async createApprovalInstance(requestData, tenantConnection) {
    const ApprovalInstanceSchema = require('../models/tenant/ApprovalInstance');
    const ApprovalInstance = tenantConnection.model('ApprovalInstance', ApprovalInstanceSchema);
    
    const ApprovalWorkflowSchema = require('../models/tenant/ApprovalWorkflow');
    const ApprovalWorkflow = tenantConnection.model('ApprovalWorkflow', ApprovalWorkflowSchema);

    try {
      // Find applicable workflow
      const workflow = await this.findApplicableWorkflow(requestData, tenantConnection);
      
      if (!workflow) {
        throw new Error(`No approval workflow found for ${requestData.requestType}`);
      }

      // Build approval chain based on workflow
      const approvalChain = await this.buildApprovalChain(workflow, requestData, tenantConnection);

      // Calculate SLA dates
      const slaStatus = this.calculateSLA(workflow, approvalChain);

      // Create approval instance
      const instance = await ApprovalInstance.create({
        requestType: requestData.requestType,
        requestId: requestData.requestId,
        requestedBy: requestData.requestedBy,
        workflowId: workflow._id,
        currentLevel: 1,
        totalLevels: approvalChain.length,
        status: 'pending',
        approvalChain,
        metadata: requestData.metadata || {},
        slaStatus,
        history: [{
          action: 'CREATED',
          performedBy: requestData.requestedBy,
          timestamp: new Date(),
          details: { workflow: workflow.name }
        }]
      });

      // Send notification to first approver
      await this.notifyApprover(instance, instance.getCurrentApprover(), tenantConnection);

      return instance;
    } catch (error) {
      console.error('Error creating approval instance:', error);
      throw error;
    }
  }

  /**
   * Find applicable workflow based on request type and conditions
   */
  async findApplicableWorkflow(requestData, tenantConnection) {
    const ApprovalWorkflowSchema = require('../models/tenant/ApprovalWorkflow');
    const ApprovalWorkflow = tenantConnection.model('ApprovalWorkflow', ApprovalWorkflowSchema);

    const workflows = await ApprovalWorkflow.find({
      requestType: requestData.requestType,
      isActive: true
    }).sort({ priority: -1 });

    for (const workflow of workflows) {
      if (await this.evaluateWorkflowConditions(workflow, requestData)) {
        return workflow;
      }
    }

    return null;
  }

  /**
   * Evaluate workflow conditions
   */
  async evaluateWorkflowConditions(workflow, requestData) {
    if (!workflow.conditions || workflow.conditions.length === 0) {
      return true; // No conditions = always applicable
    }

    for (const condition of workflow.conditions) {
      const { field, operator, value } = condition;
      const actualValue = this.getFieldValue(requestData, field);

      if (!this.evaluateCondition(actualValue, operator, value)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a single condition
   */
  evaluateCondition(actualValue, operator, expectedValue) {
    switch (operator) {
      case 'equals':
        return actualValue == expectedValue;
      case 'not_equals':
        return actualValue != expectedValue;
      case 'greater_than':
        return actualValue > expectedValue;
      case 'less_than':
        return actualValue < expectedValue;
      case 'greater_than_or_equal':
        return actualValue >= expectedValue;
      case 'less_than_or_equal':
        return actualValue <= expectedValue;
      case 'in':
        return Array.isArray(expectedValue) && expectedValue.includes(actualValue);
      case 'not_in':
        return Array.isArray(expectedValue) && !expectedValue.includes(actualValue);
      default:
        return false;
    }
  }

  /**
   * Get field value from request data
   */
  getFieldValue(requestData, field) {
    const parts = field.split('.');
    let value = requestData;
    
    for (const part of parts) {
      value = value?.[part];
      if (value === undefined) break;
    }
    
    return value;
  }

  /**
   * Build approval chain from workflow steps
   */
  async buildApprovalChain(workflow, requestData, tenantConnection) {
    const chain = [];
    const TenantUserSchema = require('../models/tenant/TenantUser');
    const TenantUser = tenantConnection.model('User', TenantUserSchema);

    for (let i = 0; i < workflow.approvalSteps.length; i++) {
      const step = workflow.approvalSteps[i];
      
      // Find approver based on type
      const approverId = await this.findApprover(step.approverType, requestData, tenantConnection);
      
      // Calculate SLA for this step
      const sla = this.calculateStepSLA(step, i === 0 ? new Date() : null);

      chain.push({
        level: i + 1,
        approverType: step.approverType,
        approverId,
        status: 'pending',
        sla
      });
    }

    return chain;
  }

  /**
   * Find approver based on type
   */
  async findApprover(approverType, requestData, tenantConnection) {
    const TenantUserSchema = require('../models/tenant/TenantUser');
    const TenantUser = tenantConnection.model('User', TenantUserSchema);
    const EmployeeSchema = require('../models/Employee');
    const Employee = tenantConnection.model('Employee', EmployeeSchema.schema);

    try {
      // Get requester details
      const requester = await TenantUser.findById(requestData.requestedBy);
      if (!requester) return null;

      const employee = await Employee.findOne({ userId: requester._id });

      switch (approverType) {
        case 'manager':
          if (requester.reportingManager) {
            const manager = await TenantUser.findOne({ email: requester.reportingManager });
            return manager?._id;
          }
          if (employee?.reportingManager) {
            const managerEmployee = await Employee.findById(employee.reportingManager);
            if (managerEmployee?.userId) {
              return managerEmployee.userId;
            }
          }
          return null;

        case 'hr':
          const hr = await TenantUser.findOne({ role: 'hr', isActive: true });
          return hr?._id;

        case 'department_head':
          if (requester.department) {
            const deptHead = await TenantUser.findOne({
              department: requester.department,
              role: 'manager',
              isActive: true
            }).sort({ createdAt: 1 });
            return deptHead?._id;
          }
          return null;

        case 'finance':
          const finance = await TenantUser.findOne({
            role: { $in: ['hr', 'company_admin'] },
            'permissions.canManagePayroll': true,
            isActive: true
          });
          return finance?._id;

        case 'ceo':
        case 'company_admin':
          const admin = await TenantUser.findOne({ role: 'company_admin', isActive: true });
          return admin?._id;

        default:
          return null;
      }
    } catch (error) {
      console.error('Error finding approver:', error);
      return null;
    }
  }

  /**
   * Calculate SLA for a step
   */
  calculateStepSLA(step, startDate = null) {
    const start = startDate || new Date();
    const dueHours = step.slaHours || 24;
    const escalationHours = step.escalationHours || dueHours + 12;

    const dueDate = new Date(start.getTime() + dueHours * 60 * 60 * 1000);
    const escalationDate = new Date(start.getTime() + escalationHours * 60 * 60 * 1000);

    return {
      dueDate,
      escalationDate,
      isEscalated: false
    };
  }

  /**
   * Calculate overall SLA status
   */
  calculateSLA(workflow, approvalChain) {
    const totalHours = approvalChain.reduce((sum, step) => {
      return sum + (step.sla?.dueDate ? 24 : 0);
    }, 0);

    const expectedCompletionDate = new Date(Date.now() + totalHours * 60 * 60 * 1000);

    return {
      startDate: new Date(),
      expectedCompletionDate,
      isBreached: false
    };
  }

  /**
   * Process approval action
   */
  async processApproval(instanceId, approverId, action, comments, tenantConnection) {
    const ApprovalInstanceSchema = require('../models/tenant/ApprovalInstance');
    const ApprovalInstance = tenantConnection.model('ApprovalInstance', ApprovalInstanceSchema);

    const instance = await ApprovalInstance.findById(instanceId);
    if (!instance) {
      throw new Error('Approval instance not found');
    }

    const currentApprover = instance.getCurrentApprover();
    if (!currentApprover) {
      throw new Error('No pending approver found');
    }

    // Check if user is authorized to approve
    if (currentApprover.approverId.toString() !== approverId.toString()) {
      throw new Error('You are not authorized to approve this request');
    }

    // Update current step
    currentApprover.status = action;
    currentApprover.actionDate = new Date();
    currentApprover.comments = comments;

    // Add to history
    instance.addHistory(action.toUpperCase(), approverId, { comments, level: instance.currentLevel });

    if (action === 'approved') {
      // Move to next level or complete
      if (instance.currentLevel < instance.totalLevels) {
        instance.currentLevel += 1;
        const nextApprover = instance.getCurrentApprover();
        await this.notifyApprover(instance, nextApprover, tenantConnection);
      } else {
        // All levels approved
        instance.status = 'approved';
        instance.slaStatus.actualCompletionDate = new Date();
        await this.notifyRequester(instance, 'approved', tenantConnection);
      }
    } else if (action === 'rejected') {
      instance.status = 'rejected';
      instance.slaStatus.actualCompletionDate = new Date();
      await this.notifyRequester(instance, 'rejected', tenantConnection);
    }

    await instance.save();
    return instance;
  }

  /**
   * Check and escalate breached SLAs
   */
  async checkAndEscalateSLAs(tenantConnection) {
    const ApprovalInstanceSchema = require('../models/tenant/ApprovalInstance');
    const ApprovalInstance = tenantConnection.model('ApprovalInstance', ApprovalInstanceSchema);

    const pendingInstances = await ApprovalInstance.find({ status: 'pending' });
    const escalated = [];

    for (const instance of pendingInstances) {
      if (instance.checkSLABreach()) {
        const currentApprover = instance.getCurrentApprover();
        
        if (!currentApprover.sla.isEscalated) {
          // Escalate to next level or manager
          currentApprover.sla.isEscalated = true;
          instance.slaStatus.isBreached = true;
          instance.slaStatus.breachReason = `SLA breached at level ${instance.currentLevel}`;
          
          instance.addHistory('ESCALATED', null, {
            level: instance.currentLevel,
            reason: 'SLA breach'
          });

          await instance.save();
          await this.notifyEscalation(instance, currentApprover, tenantConnection);
          
          escalated.push(instance);
        }
      }
    }

    return escalated;
  }

  /**
   * Send notification to approver
   */
  async notifyApprover(instance, approver, tenantConnection) {
    if (!approver) return;

    // Add notification record
    instance.notifications.push({
      sentTo: approver.approverId,
      type: 'pending',
      sentAt: new Date(),
      channel: 'email'
    });

    await instance.save();

    // TODO: Send actual email/notification
    console.log(`📧 Notification sent to approver for ${instance.requestType} request`);
  }

  /**
   * Send notification to requester
   */
  async notifyRequester(instance, status, tenantConnection) {
    instance.notifications.push({
      sentTo: instance.requestedBy,
      type: status,
      sentAt: new Date(),
      channel: 'email'
    });

    await instance.save();

    // TODO: Send actual email/notification
    console.log(`📧 ${status} notification sent to requester`);
  }

  /**
   * Send escalation notification
   */
  async notifyEscalation(instance, approver, tenantConnection) {
    instance.notifications.push({
      sentTo: approver.approverId,
      type: 'escalation',
      sentAt: new Date(),
      channel: 'email'
    });

    await instance.save();

    // TODO: Send actual email/notification
    console.log(`⚠️ Escalation notification sent for ${instance.requestType} request`);
  }
}

module.exports = new ApprovalEngine();
