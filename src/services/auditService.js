/**
 * Audit Service
 * Centralized service for logging sensitive operations
 */

class AuditService {
  /**
   * Log permission change
   */
  async logPermissionChange(userId, permission, action, changedBy, tenantConnection = null) {
    const AuditLog = tenantConnection ? 
      tenantConnection.model('AuditLog') : 
      require('../models/AuditLog');

    await AuditLog.create({
      userId: changedBy,
      action: action === 'granted' ? 'PERMISSION_GRANTED' : 'PERMISSION_REVOKED',
      resource: 'Permission',
      resourceId: userId,
      details: {
        targetUserId: userId,
        permission,
        action
      },
      category: 'permission_change',
      riskLevel: 'high'
    });
  }

  /**
   * Log salary view
   */
  async logSalaryView(employeeId, viewedBy, ipAddress = null, userAgent = null, tenantConnection = null) {
    const AuditLog = tenantConnection ? 
      tenantConnection.model('AuditLog') : 
      require('../models/AuditLog');

    await AuditLog.create({
      userId: viewedBy,
      action: 'SALARY_VIEWED',
      resource: 'Employee',
      resourceId: employeeId.toString(),
      details: {
        employeeId,
        viewedBy,
        timestamp: new Date()
      },
      ipAddress,
      userAgent,
      category: 'data_access',
      riskLevel: 'medium'
    });
  }

  /**
   * Log salary modification
   */
  async logSalaryModification(employeeId, oldSalary, newSalary, modifiedBy, reason = null, tenantConnection = null) {
    const AuditLog = tenantConnection ? 
      tenantConnection.model('AuditLog') : 
      require('../models/AuditLog');

    // Calculate percentage change
    const percentageChange = oldSalary?.total && newSalary?.total ? 
      ((newSalary.total - oldSalary.total) / oldSalary.total * 100).toFixed(2) : 0;

    // Determine risk level based on change
    let riskLevel = 'low';
    if (Math.abs(percentageChange) > 50) riskLevel = 'critical';
    else if (Math.abs(percentageChange) > 20) riskLevel = 'high';
    else if (Math.abs(percentageChange) > 10) riskLevel = 'medium';

    await AuditLog.create({
      userId: modifiedBy,
      action: 'SALARY_MODIFIED',
      resource: 'Employee',
      resourceId: employeeId.toString(),
      beforeValue: oldSalary,
      afterValue: newSalary,
      details: {
        employeeId,
        percentageChange,
        reason,
        modifiedBy
      },
      category: 'data_modification',
      riskLevel
    });
  }

  /**
   * Log attendance modification
   */
  async logAttendanceModification(attendanceId, oldData, newData, modifiedBy, reason = null, tenantConnection = null) {
    const AuditLog = tenantConnection ? 
      tenantConnection.model('AuditLog') : 
      require('../models/AuditLog');

    await AuditLog.create({
      userId: modifiedBy,
      action: 'ATTENDANCE_MODIFIED',
      resource: 'Attendance',
      resourceId: attendanceId.toString(),
      beforeValue: oldData,
      afterValue: newData,
      details: {
        attendanceId,
        reason,
        modifiedBy
      },
      category: 'data_modification',
      riskLevel: 'medium'
    });
  }

  /**
   * Log payroll access
   */
  async logPayrollAccess(payrollId, accessedBy, action = 'view', tenantConnection = null) {
    const AuditLog = tenantConnection ? 
      tenantConnection.model('AuditLog') : 
      require('../models/AuditLog');

    await AuditLog.create({
      userId: accessedBy,
      action: 'PAYROLL_ACCESSED',
      resource: 'Payroll',
      resourceId: payrollId.toString(),
      details: {
        payrollId,
        action,
        accessedBy
      },
      category: 'data_access',
      riskLevel: action === 'export' ? 'high' : 'medium'
    });
  }

  /**
   * Log access revocation
   */
  async logAccessRevocation(userId, accessType, revokedBy, reason = null, tenantConnection = null) {
    const AuditLog = tenantConnection ? 
      tenantConnection.model('AuditLog') : 
      require('../models/AuditLog');

    await AuditLog.create({
      userId: revokedBy,
      action: 'ACCESS_REVOKED',
      resource: 'User',
      resourceId: userId.toString(),
      details: {
        targetUserId: userId,
        accessType,
        reason,
        revokedBy
      },
      category: 'permission_change',
      riskLevel: 'high'
    });
  }

  /**
   * Generate audit report
   */
  async generateAuditReport(startDate, endDate, category = null, tenantConnection = null) {
    const AuditLog = tenantConnection ? 
      tenantConnection.model('AuditLog') : 
      require('../models/AuditLog');

    const query = {
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    if (category) {
      query.category = category;
    }

    const logs = await AuditLog.find(query)
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 });

    // Aggregate statistics
    const stats = {
      totalEvents: logs.length,
      byCategory: {},
      byRiskLevel: {},
      byAction: {},
      criticalEvents: logs.filter(l => l.riskLevel === 'critical').length
    };

    logs.forEach(log => {
      stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
      stats.byRiskLevel[log.riskLevel] = (stats.byRiskLevel[log.riskLevel] || 0) + 1;
      stats.byAction[log.action] = (stats.byAction[log.action] || 0) + 1;
    });

    return {
      period: { startDate, endDate },
      statistics: stats,
      logs
    };
  }
}

module.exports = new AuditService();
