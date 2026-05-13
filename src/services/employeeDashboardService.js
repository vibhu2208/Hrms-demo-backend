const Employee = require('../models/Employee');
const Leave = require('../models/Leave');
const LeaveBalance = require('../models/LeaveBalance');
const Attendance = require('../models/Attendance');
const Payroll = require('../models/Payroll');
const Project = require('../models/Project');
const EmployeeRequest = require('../models/EmployeeRequest');
const Holiday = require('../models/Holiday');
const Notification = require('../models/Notification');

/**
 * Employee Dashboard Service
 * Provides data aggregation and business logic for employee dashboard
 * @module services/employeeDashboardService
 */

class EmployeeDashboardService {
  /**
   * Get employee dashboard overview data
   * @param {String} employeeId - Employee ID
   * @returns {Object} Dashboard overview data
   */
  async getDashboardOverview(employeeId) {
    try {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth();
      const startOfMonth = new Date(currentYear, currentMonth, 1);
      const endOfMonth = new Date(currentYear, currentMonth + 1, 0);

      // Get employee details
      const employee = await Employee.findById(employeeId)
        .populate('department')
        .populate('reportingManager', 'firstName lastName email')
        .populate('currentProject')
        .lean();

      if (!employee) {
        throw new Error('Employee not found');
      }

      // Get leave balance
      const leaveBalances = await LeaveBalance.find({
        employee: employeeId,
        year: currentYear
      }).lean();

      const totalRemainingLeaves = leaveBalances.reduce((sum, lb) => sum + lb.remaining, 0);

      // Get attendance for current month
      const attendanceRecords = await Attendance.find({
        employee: employeeId,
        date: { $gte: startOfMonth, $lte: endOfMonth }
      }).lean();

      const presentDays = attendanceRecords.filter(a => a.status === 'present').length;
      const totalWorkingDays = attendanceRecords.filter(a => 
        !['weekend', 'holiday'].includes(a.status)
      ).length;
      const attendancePercentage = totalWorkingDays > 0 
        ? ((presentDays / totalWorkingDays) * 100).toFixed(2) 
        : 0;

      // Get upcoming holidays
      const upcomingHolidays = await Holiday.find({
        date: { $gte: new Date() },
        year: currentYear,
        isActive: true
      })
      .sort({ date: 1 })
      .limit(5)
      .lean();

      // Get active projects
      const activeProjects = await Project.find({
        'teamMembers.employee': employeeId,
        'teamMembers.isActive': true,
        status: { $in: ['active', 'planning'] }
      })
      .populate('client', 'name')
      .populate('projectManager', 'firstName lastName')
      .lean();

      // Get recent notifications
      const notifications = await Notification.find({
        recipient: employeeId,
        isRead: false
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

      // Get pending leave requests
      const pendingLeaves = await Leave.countDocuments({
        employee: employeeId,
        status: 'pending'
      });

      // Get pending requests
      const pendingRequests = await EmployeeRequest.countDocuments({
        employee: employeeId,
        status: { $in: ['open', 'in-progress'] }
      });

      return {
        employee: {
          id: employee._id,
          name: `${employee.firstName} ${employee.lastName}`,
          employeeCode: employee.employeeCode,
          designation: employee.designation,
          department: employee.department?.name,
          email: employee.email,
          phone: employee.phone,
          joiningDate: employee.joiningDate,
          profileImage: employee.profileImage,
          reportingManager: employee.reportingManager
        },
        quickStats: {
          remainingLeaves: totalRemainingLeaves,
          attendancePercentage: parseFloat(attendancePercentage),
          upcomingHolidays: upcomingHolidays.length,
          activeProjects: activeProjects.length,
          pendingLeaves,
          pendingRequests
        },
        upcomingHolidays: upcomingHolidays.map(h => ({
          name: h.name,
          date: h.date,
          type: h.type,
          description: h.description
        })),
        activeProjects: activeProjects.map(p => ({
          id: p._id,
          name: p.name,
          projectCode: p.projectCode,
          client: p.client?.name,
          status: p.status,
          projectManager: p.projectManager ? 
            `${p.projectManager.firstName} ${p.projectManager.lastName}` : null,
          startDate: p.startDate,
          endDate: p.endDate
        })),
        recentNotifications: notifications.map(n => ({
          id: n._id,
          type: n.type,
          title: n.title,
          message: n.message,
          createdAt: n.createdAt
        }))
      };
    } catch (error) {
      throw new Error(`Failed to fetch dashboard overview: ${error.message}`);
    }
  }

  /**
   * Get employee leave summary
   * @param {String} employeeId - Employee ID
   * @param {Number} year - Year (optional, defaults to current year)
   * @returns {Object} Leave summary data
   */
  async getLeaveSummary(employeeId, year = new Date().getFullYear()) {
    try {
      const leaveBalances = await LeaveBalance.find({
        employee: employeeId,
        year
      }).lean();

      const leaveHistory = await Leave.find({
        employee: employeeId,
        startDate: {
          $gte: new Date(year, 0, 1),
          $lte: new Date(year, 11, 31)
        }
      })
      .populate('approvedBy', 'email')
      .sort({ createdAt: -1 })
      .lean();

      return {
        balances: leaveBalances.map(lb => ({
          leaveType: lb.leaveType,
          totalAllotted: lb.totalAllotted,
          used: lb.used,
          pending: lb.pending,
          remaining: lb.remaining,
          carriedForward: lb.carriedForward
        })),
        history: leaveHistory.map(l => ({
          id: l._id,
          leaveType: l.leaveType,
          startDate: l.startDate,
          endDate: l.endDate,
          numberOfDays: l.numberOfDays,
          reason: l.reason,
          status: l.status,
          approvedBy: l.approvedBy?.email,
          approvedAt: l.approvedAt,
          rejectionReason: l.rejectionReason,
          createdAt: l.createdAt
        }))
      };
    } catch (error) {
      throw new Error(`Failed to fetch leave summary: ${error.message}`);
    }
  }

  /**
   * Get employee attendance summary
   * @param {String} employeeId - Employee ID
   * @param {Number} month - Month (0-11)
   * @param {Number} year - Year
   * @returns {Object} Attendance summary data
   */
  async getAttendanceSummary(employeeId, month, year) {
    try {
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0);

      const attendanceRecords = await Attendance.find({
        employee: employeeId,
        date: { $gte: startDate, $lte: endDate }
      })
      .sort({ date: 1 })
      .lean();

      const summary = {
        totalDays: attendanceRecords.length,
        present: 0,
        absent: 0,
        halfDay: 0,
        onLeave: 0,
        late: 0,
        totalWorkHours: 0,
        totalOvertime: 0,
        averageWorkHours: 0
      };

      attendanceRecords.forEach(record => {
        switch (record.status) {
          case 'present':
            summary.present++;
            break;
          case 'absent':
            summary.absent++;
            break;
          case 'half-day':
            summary.halfDay++;
            break;
          case 'on-leave':
            summary.onLeave++;
            break;
          case 'late':
            summary.late++;
            summary.present++;
            break;
        }
        summary.totalWorkHours += record.workHours || 0;
        summary.totalOvertime += record.overtime || 0;
      });

      summary.averageWorkHours = summary.present > 0 
        ? (summary.totalWorkHours / summary.present).toFixed(2) 
        : 0;

      return {
        summary,
        records: attendanceRecords.map(r => ({
          date: r.date,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          status: r.status,
          workHours: r.workHours,
          overtime: r.overtime,
          lateBy: r.lateBy,
          location: r.location
        }))
      };
    } catch (error) {
      throw new Error(`Failed to fetch attendance summary: ${error.message}`);
    }
  }

  /**
   * Get employee payslip history
   * @param {String} employeeId - Employee ID
   * @param {Number} limit - Number of records to fetch
   * @returns {Array} Payslip history
   */
  async getPayslipHistory(employeeId, limit = 12) {
    try {
      const payslips = await Payroll.find({
        employee: employeeId
      })
      .sort({ year: -1, month: -1 })
      .limit(limit)
      .lean();

      return payslips.map(p => ({
        id: p._id,
        month: p.month,
        year: p.year,
        basicSalary: p.basicSalary,
        allowances: p.allowances,
        deductions: p.deductions,
        bonus: p.bonus,
        overtime: p.overtime,
        totalEarnings: p.totalEarnings,
        totalDeductions: p.totalDeductions,
        netSalary: p.netSalary,
        paymentStatus: p.paymentStatus,
        paymentDate: p.paymentDate
      }));
    } catch (error) {
      throw new Error(`Failed to fetch payslip history: ${error.message}`);
    }
  }

  /**
   * Get employee project details
   * @param {String} employeeId - Employee ID
   * @returns {Array} Project details
   */
  async getEmployeeProjects(employeeId) {
    try {
      const projects = await Project.find({
        'teamMembers.employee': employeeId
      })
      .populate('client', 'name email')
      .populate('projectManager', 'firstName lastName email')
      .populate('teamMembers.employee', 'firstName lastName email designation')
      .lean();

      return projects.map(p => {
        const memberInfo = p.teamMembers.find(
          tm => tm.employee._id.toString() === employeeId.toString()
        );

        return {
          id: p._id,
          projectCode: p.projectCode,
          name: p.name,
          description: p.description,
          client: p.client,
          status: p.status,
          startDate: p.startDate,
          endDate: p.endDate,
          projectManager: p.projectManager ? {
            name: `${p.projectManager.firstName} ${p.projectManager.lastName}`,
            email: p.projectManager.email
          } : null,
          myRole: memberInfo?.role,
          myStartDate: memberInfo?.startDate,
          myEndDate: memberInfo?.endDate,
          isActive: memberInfo?.isActive,
          teamSize: p.teamMembers.length
        };
      });
    } catch (error) {
      throw new Error(`Failed to fetch employee projects: ${error.message}`);
    }
  }

  /**
   * Get employee requests
   * @param {String} employeeId - Employee ID
   * @param {String} status - Filter by status (optional)
   * @returns {Array} Employee requests
   */
  async getEmployeeRequests(employeeId, status = null) {
    try {
      const query = { employee: employeeId };
      if (status) {
        query.status = status;
      }

      const requests = await EmployeeRequest.find(query)
        .populate('assignedTo', 'email')
        .sort({ createdAt: -1 })
        .lean();

      return requests.map(r => ({
        id: r._id,
        requestNumber: r.requestNumber,
        requestType: r.requestType,
        priority: r.priority,
        subject: r.subject,
        description: r.description,
        status: r.status,
        assignedTo: r.assignedTo?.email,
        assignedAt: r.assignedAt,
        documents: r.documents,
        comments: r.comments,
        resolution: r.resolution,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      }));
    } catch (error) {
      throw new Error(`Failed to fetch employee requests: ${error.message}`);
    }
  }
}

module.exports = new EmployeeDashboardService();
