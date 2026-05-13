const { getTenantConnection } = require('../config/database.config');
const AttendanceRegularizationSchema = require('../models/tenant/AttendanceRegularization');
const approvalValidationService = require('../services/approvalValidationService');
const auditService = require('../services/auditService');

/**
 * Create attendance regularization request
 */
exports.createRegularizationRequest = async (req, res) => {
  try {
    const { employeeId, date, requestedAttendance, reason, attachments } = req.body;
    const companyId = req.companyId;
    const userId = req.user.userId;

    // Get tenant connection
    const tenantConnection = await getTenantConnection(companyId);
    const AttendanceRegularization = tenantConnection.model('AttendanceRegularization', AttendanceRegularizationSchema);
    const Attendance = tenantConnection.model('Attendance');

    // Get current attendance record if exists
    const currentAttendance = await Attendance.findOne({
      employeeId,
      date: {
        $gte: new Date(date).setHours(0, 0, 0, 0),
        $lte: new Date(date).setHours(23, 59, 59, 999)
      }
    });

    // Create regularization request
    const regularization = await AttendanceRegularization.create({
      employeeId,
      date,
      requestedAttendance,
      currentAttendance: currentAttendance ? {
        checkIn: currentAttendance.checkIn,
        checkOut: currentAttendance.checkOut,
        status: currentAttendance.status,
        workingHours: currentAttendance.workingHours
      } : null,
      reason,
      requestedBy: userId,
      attachments: attachments || [],
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    // Log the request
    await auditService.logAttendanceModification(
      regularization._id,
      currentAttendance,
      requestedAttendance,
      userId,
      reason,
      tenantConnection
    );

    res.status(201).json({
      success: true,
      message: 'Attendance regularization request created successfully',
      data: regularization
    });
  } catch (error) {
    console.error('Error creating regularization request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create regularization request',
      error: error.message
    });
  }
};

/**
 * Get regularization requests (for employee)
 */
exports.getMyRegularizations = async (req, res) => {
  try {
    const companyId = req.companyId;
    const userId = req.user.userId;
    const { status } = req.query;

    const tenantConnection = await getTenantConnection(companyId);
    const AttendanceRegularization = tenantConnection.model('AttendanceRegularization', AttendanceRegularizationSchema);

    const query = { requestedBy: userId };
    if (status) query.status = status;

    const regularizations = await AttendanceRegularization.find(query)
      .populate('employeeId', 'firstName lastName employeeCode')
      .populate('approvedBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: regularizations.length,
      data: regularizations
    });
  } catch (error) {
    console.error('Error fetching regularizations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch regularizations',
      error: error.message
    });
  }
};

/**
 * Get pending regularizations (for manager/HR)
 */
exports.getPendingRegularizations = async (req, res) => {
  try {
    const companyId = req.companyId;
    const tenantConnection = await getTenantConnection(companyId);
    const AttendanceRegularization = tenantConnection.model('AttendanceRegularization', AttendanceRegularizationSchema);

    const regularizations = await AttendanceRegularization.find({ status: 'pending' })
      .populate('employeeId', 'firstName lastName employeeCode department')
      .populate('requestedBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: regularizations.length,
      data: regularizations
    });
  } catch (error) {
    console.error('Error fetching pending regularizations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending regularizations',
      error: error.message
    });
  }
};

/**
 * Approve regularization request
 */
exports.approveRegularization = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;
    const companyId = req.companyId;
    const approverId = req.user.userId;

    const tenantConnection = await getTenantConnection(companyId);
    const AttendanceRegularization = tenantConnection.model('AttendanceRegularization', AttendanceRegularizationSchema);
    const Attendance = tenantConnection.model('Attendance');

    const regularization = await AttendanceRegularization.findById(id);
    if (!regularization) {
      return res.status(404).json({
        success: false,
        message: 'Regularization request not found'
      });
    }

    // SECURITY: Prevent self-approval
    if (regularization.requestedBy.toString() === approverId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You cannot approve your own regularization request',
        code: 'SELF_APPROVAL_FORBIDDEN'
      });
    }

    // Update or create attendance record
    const attendanceDate = new Date(regularization.date);
    const startOfDay = new Date(attendanceDate).setHours(0, 0, 0, 0);
    const endOfDay = new Date(attendanceDate).setHours(23, 59, 59, 999);

    await Attendance.findOneAndUpdate(
      {
        employeeId: regularization.employeeId,
        date: { $gte: startOfDay, $lte: endOfDay }
      },
      {
        checkIn: regularization.requestedAttendance.checkIn,
        checkOut: regularization.requestedAttendance.checkOut,
        status: regularization.requestedAttendance.status,
        workingHours: regularization.requestedAttendance.workingHours,
        isRegularized: true,
        regularizedBy: approverId,
        regularizedAt: new Date()
      },
      { upsert: true, new: true }
    );

    // Update regularization status
    regularization.status = 'approved';
    regularization.approvedBy = approverId;
    regularization.approvalDate = new Date();
    await regularization.save();

    // Log approval
    await approvalValidationService.logApprovalAttempt(
      approverId,
      id,
      'approve',
      true,
      null,
      tenantConnection
    );

    res.json({
      success: true,
      message: 'Regularization request approved successfully',
      data: regularization
    });
  } catch (error) {
    console.error('Error approving regularization:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve regularization',
      error: error.message
    });
  }
};

/**
 * Reject regularization request
 */
exports.rejectRegularization = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    const companyId = req.companyId;
    const approverId = req.user.userId;

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const tenantConnection = await getTenantConnection(companyId);
    const AttendanceRegularization = tenantConnection.model('AttendanceRegularization', AttendanceRegularizationSchema);

    const regularization = await AttendanceRegularization.findById(id);
    if (!regularization) {
      return res.status(404).json({
        success: false,
        message: 'Regularization request not found'
      });
    }

    // SECURITY: Prevent self-rejection
    if (regularization.requestedBy.toString() === approverId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You cannot reject your own regularization request',
        code: 'SELF_APPROVAL_FORBIDDEN'
      });
    }

    regularization.status = 'rejected';
    regularization.approvedBy = approverId;
    regularization.approvalDate = new Date();
    regularization.rejectionReason = rejectionReason;
    await regularization.save();

    // Log rejection
    await approvalValidationService.logApprovalAttempt(
      approverId,
      id,
      'reject',
      true,
      null,
      tenantConnection
    );

    res.json({
      success: true,
      message: 'Regularization request rejected',
      data: regularization
    });
  } catch (error) {
    console.error('Error rejecting regularization:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject regularization',
      error: error.message
    });
  }
};

/**
 * Cancel regularization request (by employee)
 */
exports.cancelRegularization = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId;
    const userId = req.user.userId;

    const tenantConnection = await getTenantConnection(companyId);
    const AttendanceRegularization = tenantConnection.model('AttendanceRegularization', AttendanceRegularizationSchema);

    const regularization = await AttendanceRegularization.findById(id);
    if (!regularization) {
      return res.status(404).json({
        success: false,
        message: 'Regularization request not found'
      });
    }

    // Only requester can cancel
    if (regularization.requestedBy.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only cancel your own requests'
      });
    }

    // Can only cancel pending requests
    if (regularization.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending requests can be cancelled'
      });
    }

    regularization.status = 'cancelled';
    await regularization.save();

    res.json({
      success: true,
      message: 'Regularization request cancelled',
      data: regularization
    });
  } catch (error) {
    console.error('Error cancelling regularization:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel regularization',
      error: error.message
    });
  }
};
