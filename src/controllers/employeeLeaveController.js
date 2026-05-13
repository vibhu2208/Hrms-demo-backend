// Multi-tenant compatible leave controller
const { getTenantConnection } = require('../config/database.config');
const TenantUserSchema = require('../models/tenant/TenantUser');
const LeaveRequestSchema = require('../models/tenant/LeaveRequest');
const LeaveBalanceSchema = require('../models/tenant/LeaveBalance');

/**
 * Employee Leave Controller
 * Handles leave application and management for employees
 * @module controllers/employeeLeaveController
 */

/**
 * Get leave balance
 */
exports.getLeaveBalance = async (req, res) => {
  let tenantConnection = null;
  
  try {
    const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
    const companyId = req.companyId;
    const user = req.user;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID not found'
      });
    }

    // Get tenant connection
    tenantConnection = await getTenantConnection(companyId);
    const LeaveBalance = tenantConnection.model('LeaveBalance', LeaveBalanceSchema);

    // Check if balances exist for this year
    let balances = await LeaveBalance.find({
      employeeEmail: user.email,
      year: year
    });

    // If no balances found, initialize with default values
    if (balances.length === 0) {
      console.log(`📊 Initializing leave balances for ${user.email} - Year ${year}`);
      
      const defaultLeaveTypes = [
        { type: 'Comp Offs', total: 5 },
        { type: 'Floater Leave', total: 2 },
        { type: 'Marriage Leave', total: 3 },
        { type: 'Maternity Leave', total: 90 },
        { type: 'Personal Leave', total: 12 },
        { type: 'Sick Leave', total: 7 },
        { type: 'Unpaid Leave', total: 0 }
      ];

      const balancePromises = defaultLeaveTypes.map(lt => {
        const balance = new LeaveBalance({
          employeeId: user._id,
          employeeEmail: user.email,
          year: year,
          leaveType: lt.type,
          total: lt.total,
          consumed: 0,
          available: lt.total
        });
        return balance.save();
      });

      balances = await Promise.all(balancePromises);
      console.log(`✅ Initialized ${balances.length} leave types`);
    }

    // Close connection
    if (tenantConnection) await tenantConnection.close();

    res.status(200).json({ success: true, data: balances });
  } catch (error) {
    console.error('Error fetching leave balance:', error);
    if (tenantConnection) await tenantConnection.close();
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get leave applications
 */
exports.getLeaveApplications = async (req, res) => {
  let tenantConnection = null;
  
  try {
    const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
    const status = req.query.status; // pending, approved, rejected
    const companyId = req.companyId;
    const user = req.user;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID not found'
      });
    }

    // Get tenant connection
    tenantConnection = await getTenantConnection(companyId);
    const LeaveRequest = tenantConnection.model('LeaveRequest', LeaveRequestSchema);

    // Build query
    const query = {
      employeeEmail: user.email,
      startDate: {
        $gte: new Date(year, 0, 1),
        $lte: new Date(year, 11, 31)
      }
    };

    // Add status filter if provided
    if (status) {
      query.status = status;
    }

    // Fetch leave applications
    const leaveApplications = await LeaveRequest.find(query).sort({ appliedOn: -1 });

    console.log(`📋 Found ${leaveApplications.length} leave applications for ${user.email}`);

    // Close connection
    if (tenantConnection) await tenantConnection.close();
    
    res.status(200).json({ success: true, data: leaveApplications });
  } catch (error) {
    console.error('Error fetching leave applications:', error);
    if (tenantConnection) await tenantConnection.close();
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get leave details
 */
exports.getLeaveDetails = async (req, res) => {
  try {
    res.status(404).json({ success: false, message: 'Leave not found' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Map frontend leaveType values to backend enum values
 */
const mapLeaveType = (leaveType) => {
  if (!leaveType) return leaveType;
  
  const mapping = {
    'casual': 'Casual Leave',
    'sick': 'Sick Leave',
    'earned': 'Personal Leave',
    'personal': 'Personal Leave',
    'maternity': 'Maternity Leave',
    'paternity': 'Paternity Leave',
    'unpaid': 'Unpaid Leave',
    'comp off': 'Comp Offs',
    'comp offs': 'Comp Offs',
    'floater': 'Floater Leave',
    'marriage': 'Marriage Leave'
  };
  
  // If already in correct format, return as is
  const validEnums = ['Personal Leave', 'Sick Leave', 'Casual Leave', 'Comp Offs', 'Floater Leave', 'Marriage Leave', 'Maternity Leave', 'Paternity Leave', 'Unpaid Leave'];
  if (validEnums.includes(leaveType)) {
    return leaveType;
  }
  
  // Map lowercase/short values to enum values
  const normalized = leaveType.toLowerCase().trim();
  return mapping[normalized] || leaveType;
};

/**
 * Apply for leave
 */
exports.applyLeave = async (req, res) => {
  let tenantConnection = null;
  
  try {
    let { leaveType, startDate, endDate, reason } = req.body;
    const companyId = req.companyId;
    const user = req.user;

    // Validate required fields
    if (!leaveType || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Leave type, start date, and end date are required'
      });
    }
    
    // Map leaveType to valid enum value
    leaveType = mapLeaveType(leaveType);
    
    // Validate that the mapped leaveType is a valid enum value
    const validEnums = ['Personal Leave', 'Sick Leave', 'Casual Leave', 'Comp Offs', 'Floater Leave', 'Marriage Leave', 'Maternity Leave', 'Paternity Leave', 'Unpaid Leave'];
    if (!validEnums.includes(leaveType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid leave type. Valid types are: ${validEnums.join(', ')}`
      });
    }

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID not found'
      });
    }

    // Calculate number of days
    const start = new Date(startDate);
    const end = new Date(endDate);
    const numberOfDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    // Get tenant connection
    tenantConnection = await getTenantConnection(companyId);
    const TenantUser = tenantConnection.model('User', TenantUserSchema);
    const LeaveRequest = tenantConnection.model('LeaveRequest', LeaveRequestSchema);

    // Get employee details with reporting manager
    const employee = await TenantUser.findById(user._id).select('firstName lastName email reportingManager');

    if (!employee) {
      if (tenantConnection) await tenantConnection.close();
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    console.log(`📝 Leave application from: ${employee.email}, Manager: ${employee.reportingManager || 'None'}`);

    // Create leave request
    const leaveRequest = new LeaveRequest({
      employeeId: employee._id,
      employeeEmail: employee.email,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      leaveType,
      startDate: start,
      endDate: end,
      numberOfDays,
      reason: reason || '',
      status: 'pending',
      reportingManager: employee.reportingManager || null,
      appliedOn: new Date()
    });

    await leaveRequest.save();

    console.log(`✅ Leave request created: ${leaveRequest._id}`);

    // Create approval instance using the approval engine
    try {
      const approvalEngine = require('../services/approvalEngine');
      
      const approvalInstance = await approvalEngine.createApprovalInstance({
        requestType: 'leave',
        requestId: leaveRequest._id,
        requestedBy: employee._id,
        metadata: {
          duration: numberOfDays,
          leaveType: leaveType,
          startDate: start,
          endDate: end,
          priority: 'medium'
        }
      }, tenantConnection);

      // Update leave request with approval instance ID
      leaveRequest.approvalInstanceId = approvalInstance._id;
      await leaveRequest.save();

      console.log(`✅ Approval workflow initiated: ${approvalInstance._id}`);
      console.log(`   Workflow: ${approvalInstance.totalLevels} level(s)`);
    } catch (approvalError) {
      console.error('⚠️  Error creating approval instance:', approvalError.message);
      // Don't fail the leave request if approval creation fails
      // The leave can still be approved manually
    }

    // Close connection
    if (tenantConnection) await tenantConnection.close();

    res.status(201).json({
      success: true,
      message: 'Leave application submitted successfully and sent for approval',
      data: leaveRequest
    });
  } catch (error) {
    console.error('Error applying for leave:', error);
    if (tenantConnection) await tenantConnection.close();
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to apply for leave'
    });
  }
};

/**
 * Cancel leave
 */
exports.cancelLeave = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Leave cancellation feature coming soon'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
