const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');
const { tenantMiddleware } = require('../middlewares/tenantMiddleware');

// Import controllers
const employeeDashboardController = require('../controllers/employeeDashboardController');
const employeeLeaveController = require('../controllers/employeeLeaveController');
const employeeAttendanceController = require('../controllers/employeeAttendanceController');
const employeeRequestController = require('../controllers/employeeRequestController');

/**
 * Employee Dashboard Routes
 * All routes are protected and accessible only to employees
 * @module routes/employeeDashboard
 */

// Apply authentication, authorization, and tenant middleware to all routes
router.use(protect);
router.use(tenantMiddleware);
router.use(authorize('employee', 'hr', 'manager', 'company_admin'));

// ==================== Dashboard Routes ====================
/**
 * @route   GET /api/employee/dashboard
 * @desc    Get employee dashboard overview
 * @access  Private (Employee)
 */
router.get('/dashboard', employeeDashboardController.getDashboardOverview);

// ==================== Profile Routes ====================
/**
 * @route   GET /api/employee/profile
 * @desc    Get employee profile
 * @access  Private (Employee)
 */
router.get('/profile', employeeDashboardController.getEmployeeProfile);

/**
 * @route   PUT /api/employee/profile
 * @desc    Update employee profile
 * @access  Private (Employee)
 */
router.put('/profile', employeeDashboardController.updateEmployeeProfile);

// ==================== Leave Routes ====================
/**
 * @route   GET /api/employee/leaves/summary
 * @desc    Get leave summary
 * @access  Private (Employee)
 */
router.get('/leaves/summary', employeeDashboardController.getLeaveSummary);

/**
 * @route   GET /api/employee/leaves/balance
 * @desc    Get leave balance
 * @access  Private (Employee)
 */
router.get('/leaves/balance', employeeLeaveController.getLeaveBalance);

/**
 * @route   GET /api/employee/leaves
 * @desc    Get all leave applications
 * @access  Private (Employee)
 */
router.get('/leaves', employeeLeaveController.getLeaveApplications);

/**
 * @route   GET /api/employee/leaves/:id
 * @desc    Get leave details
 * @access  Private (Employee)
 */
router.get('/leaves/:id', employeeLeaveController.getLeaveDetails);

/**
 * @route   POST /api/employee/leaves/apply
 * @desc    Apply for leave
 * @access  Private (Employee)
 */
router.post('/leaves/apply', employeeLeaveController.applyLeave);

/**
 * @route   PUT /api/employee/leaves/:id/cancel
 * @desc    Cancel leave application
 * @access  Private (Employee)
 */
router.put('/leaves/:id/cancel', employeeLeaveController.cancelLeave);

// ==================== Attendance Routes ====================
/**
 * @route   GET /api/employee/attendance/summary
 * @desc    Get attendance summary
 * @access  Private (Employee)
 */
router.get('/attendance/summary', employeeDashboardController.getAttendanceSummary);

/**
 * @route   GET /api/employee/attendance/today
 * @desc    Get today's attendance
 * @access  Private (Employee)
 */
router.get('/attendance/today', employeeAttendanceController.getTodayAttendance);

/**
 * @route   GET /api/employee/attendance/history
 * @desc    Get attendance history
 * @access  Private (Employee)
 */
router.get('/attendance/history', employeeAttendanceController.getAttendanceHistory);

/**
 * @route   POST /api/employee/attendance/check-in
 * @desc    Mark check-in
 * @access  Private (Employee)
 */
router.post('/attendance/check-in', employeeAttendanceController.checkIn);

/**
 * @route   POST /api/employee/attendance/check-out
 * @desc    Mark check-out
 * @access  Private (Employee)
 */
router.post('/attendance/check-out', employeeAttendanceController.checkOut);

/**
 * @route   POST /api/employee/attendance/regularize
 * @desc    Request attendance regularization
 * @access  Private (Employee)
 */
router.post('/attendance/regularize', employeeAttendanceController.requestRegularization);

// ==================== Payroll Routes ====================
/**
 * @route   GET /api/employee/payslips
 * @desc    Get payslip history
 * @access  Private (Employee)
 */
router.get('/payslips', employeeDashboardController.getPayslipHistory);

// ==================== Project Routes ====================
/**
 * @route   GET /api/employee/projects
 * @desc    Get employee projects
 * @access  Private (Employee)
 */
router.get('/projects', employeeDashboardController.getEmployeeProjects);

// ==================== Request Routes ====================
/**
 * @route   GET /api/employee/requests
 * @desc    Get all employee requests
 * @access  Private (Employee)
 */
router.get('/requests', employeeRequestController.getRequests);

/**
 * @route   GET /api/employee/requests/:id
 * @desc    Get request details
 * @access  Private (Employee)
 */
router.get('/requests/:id', employeeRequestController.getRequestDetails);

/**
 * @route   POST /api/employee/requests
 * @desc    Create new request
 * @access  Private (Employee)
 */
router.post('/requests', employeeRequestController.createRequest);

/**
 * @route   PUT /api/employee/requests/:id
 * @desc    Update request
 * @access  Private (Employee)
 */
router.put('/requests/:id', employeeRequestController.updateRequest);

/**
 * @route   PUT /api/employee/requests/:id/close
 * @desc    Close request
 * @access  Private (Employee)
 */
router.put('/requests/:id/close', employeeRequestController.closeRequest);

/**
 * @route   POST /api/employee/requests/:id/comments
 * @desc    Add comment to request
 * @access  Private (Employee)
 */
router.post('/requests/:id/comments', employeeRequestController.addComment);

module.exports = router;
