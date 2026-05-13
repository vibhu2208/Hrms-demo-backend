/**
 * Payroll Approval Model - Stored in tenant database
 * Tracks payroll approval workflow with anomaly detection
 */

const mongoose = require('mongoose');

const payrollApprovalSchema = new mongoose.Schema({
  payrollCycle: {
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12
    },
    year: {
      type: Number,
      required: true
    }
  },
  totalEmployees: {
    type: Number,
    required: true
  },
  totalGrossSalary: {
    type: Number,
    required: true
  },
  totalDeductions: {
    type: Number,
    required: true
  },
  totalNetSalary: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'pending_hr', 'pending_finance', 'pending_ceo', 'approved', 'rejected', 'processed'],
    default: 'draft'
  },
  // Approval workflow
  approvalInstanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ApprovalInstance'
  },
  // Anomaly detection
  anomalies: [{
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    employeeEmail: String,
    employeeName: String,
    anomalyType: {
      type: String,
      enum: ['salary_spike', 'negative_pay', 'missing_data', 'unusual_deduction', 'overtime_excessive']
    },
    description: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    previousValue: Number,
    currentValue: Number,
    percentageChange: Number,
    resolved: {
      type: Boolean,
      default: false
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    resolvedAt: Date,
    resolutionNotes: String
  }],
  // Freeze status
  isFrozen: {
    type: Boolean,
    default: false
  },
  frozenAt: Date,
  frozenBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Processing details
  processedAt: Date,
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  paymentDate: Date,
  // Approval history
  approvalHistory: [{
    approver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approverEmail: String,
    action: {
      type: String,
      enum: ['approved', 'rejected', 'sent_back']
    },
    comments: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  // Metadata
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
payrollApprovalSchema.index({ 'payrollCycle.month': 1, 'payrollCycle.year': 1 });
payrollApprovalSchema.index({ status: 1 });
payrollApprovalSchema.index({ isFrozen: 1 });

// Method to check if payroll can be modified
payrollApprovalSchema.methods.canModify = function() {
  return !this.isFrozen && ['draft', 'rejected'].includes(this.status);
};

// Method to freeze payroll
payrollApprovalSchema.methods.freeze = function(userId) {
  this.isFrozen = true;
  this.frozenAt = new Date();
  this.frozenBy = userId;
};

// Method to detect anomalies
payrollApprovalSchema.methods.detectAnomalies = async function(payrollData) {
  const anomalies = [];
  
  for (const employee of payrollData) {
    // Check for salary spike (> 20% increase)
    if (employee.previousSalary && employee.currentSalary) {
      const percentageChange = ((employee.currentSalary - employee.previousSalary) / employee.previousSalary) * 100;
      
      if (Math.abs(percentageChange) > 20) {
        anomalies.push({
          employeeId: employee.employeeId,
          employeeEmail: employee.email,
          employeeName: employee.name,
          anomalyType: 'salary_spike',
          description: `Salary ${percentageChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(percentageChange).toFixed(2)}%`,
          severity: Math.abs(percentageChange) > 50 ? 'critical' : 'high',
          previousValue: employee.previousSalary,
          currentValue: employee.currentSalary,
          percentageChange: percentageChange
        });
      }
    }
    
    // Check for negative pay
    if (employee.netSalary < 0) {
      anomalies.push({
        employeeId: employee.employeeId,
        employeeEmail: employee.email,
        employeeName: employee.name,
        anomalyType: 'negative_pay',
        description: 'Net salary is negative',
        severity: 'critical',
        currentValue: employee.netSalary
      });
    }
    
    // Check for missing critical data
    if (!employee.grossSalary || employee.grossSalary === 0) {
      anomalies.push({
        employeeId: employee.employeeId,
        employeeEmail: employee.email,
        employeeName: employee.name,
        anomalyType: 'missing_data',
        description: 'Gross salary is missing or zero',
        severity: 'high'
      });
    }
  }
  
  this.anomalies = anomalies;
  return anomalies;
};

module.exports = payrollApprovalSchema;
