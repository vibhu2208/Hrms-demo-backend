const TenantUserSchema = require('../models/tenant/TenantUser');
const { getTenantModel } = require('../utils/tenantModels');
const mongoose = require('mongoose');

exports.getDashboardStats = async (req, res) => {
  try {
    // Get tenant connection
    const tenantConnection = req.tenant.connection;
    const TenantUser = tenantConnection.model('User', TenantUserSchema);
    const JobPosting = getTenantModel(tenantConnection, 'JobPosting');
    const Candidate = getTenantModel(tenantConnection, 'Candidate');
    
    // 1. HR Management Users Stats (hr, admin, company_admin)
    const totalEmployees = await TenantUser.countDocuments({ 
      role: { $in: ['hr', 'admin', 'company_admin'] }
    });
    
    const activeEmployees = await TenantUser.countDocuments({ 
      role: { $in: ['hr', 'admin', 'company_admin'] },
      isActive: true
    });

    // 2. Job Openings Stats
    let activeJobs = 0;
    if (JobPosting) {
      activeJobs = await JobPosting.countDocuments({ status: 'active' });
    }

    // 3. Candidates Stats
    let totalCandidates = 0;
    if (Candidate) {
      totalCandidates = await Candidate.countDocuments({ isActive: true });
    }

    // 4. Chart Data - Employee Growth Trend (Last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1); // Start of month
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const employeeTrend = await TenantUser.aggregate([
      {
        $match: {
          role: { $in: ['hr', 'admin', 'company_admin'] },
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          total: { $sum: 1 },
          active: {
            $sum: {
              $cond: [
                { $eq: ['$isActive', true] },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      },
      {
        $project: {
          _id: 0,
          month: {
            $dateToString: {
              format: '%Y-%m',
              date: {
                $dateFromParts: {
                  year: '$_id.year',
                  month: '$_id.month',
                  day: 1
                }
              }
            }
          },
          total: 1,
          active: 1
        }
      }
    ]);

    // Fill in missing months with cumulative counts
    const filledEmployeeTrend = [];
    const monthMap = new Map();
    employeeTrend.forEach(item => {
      monthMap.set(item.month, item);
    });

    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = date.toISOString().substring(0, 7);
      
      if (monthMap.has(monthKey)) {
        filledEmployeeTrend.push(monthMap.get(monthKey));
      } else {
        // Get cumulative count up to this month
        const cumulativeTotal = await TenantUser.countDocuments({
          role: { $in: ['hr', 'admin', 'company_admin'] },
          createdAt: { $lte: new Date(date.getFullYear(), date.getMonth() + 1, 0) }
        });
        const cumulativeActive = await TenantUser.countDocuments({
          role: { $in: ['hr', 'admin', 'company_admin'] },
          isActive: true,
          createdAt: { $lte: new Date(date.getFullYear(), date.getMonth() + 1, 0) }
        });
        filledEmployeeTrend.push({
          month: monthKey,
          total: cumulativeTotal,
          active: cumulativeActive
        });
      }
    }

    // 5. Chart Data - Job Openings Trend (Last 6 months)
    let jobOpeningsTrend = [];
    if (JobPosting) {
      const jobTrend = await JobPosting.aggregate([
        {
          $match: {
            status: 'active',
            createdAt: { $gte: sixMonthsAgo }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1 }
        },
        {
          $project: {
            _id: 0,
            month: {
              $dateToString: {
                format: '%Y-%m',
                date: {
                  $dateFromParts: {
                    year: '$_id.year',
                    month: '$_id.month',
                    day: 1
                  }
                }
              }
            },
            count: 1
          }
        }
      ]);

      // Fill in missing months
      const jobMonthMap = new Map();
      jobTrend.forEach(item => {
        jobMonthMap.set(item.month, item);
      });

      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = date.toISOString().substring(0, 7);
        
        if (jobMonthMap.has(monthKey)) {
          jobOpeningsTrend.push(jobMonthMap.get(monthKey));
        } else {
          // Get active jobs count for this month
          const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
          const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
          const monthCount = await JobPosting.countDocuments({
            status: 'active',
            createdAt: { $lte: monthEnd }
          });
          jobOpeningsTrend.push({
            month: monthKey,
            count: monthCount
          });
        }
      }
    } else {
      // Fill with zeros if JobPosting model doesn't exist
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = date.toISOString().substring(0, 7);
        jobOpeningsTrend.push({ month: monthKey, count: 0 });
      }
    }

    // 6. Chart Data - Candidates by Stage
    let candidatesByStage = [];
    if (Candidate) {
      const stageData = await Candidate.aggregate([
        {
          $match: { isActive: true }
        },
        {
          $group: {
            _id: '$stage',
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            stage: { $ifNull: ['$_id', 'applied'] },
            count: 1
          }
        },
        {
          $sort: { count: -1 }
        }
      ]);

      // Map to ensure all stages are represented
      const stageMap = new Map();
      stageData.forEach(item => {
        stageMap.set(item.stage, item.count);
      });

      const allStages = ['applied', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected'];
      candidatesByStage = allStages.map(stage => ({
        stage: stage.charAt(0).toUpperCase() + stage.slice(1),
        count: stageMap.get(stage) || 0
      }));
    } else {
      // Default empty stages
      candidatesByStage = [
        { stage: 'Applied', count: 0 },
        { stage: 'Screening', count: 0 },
        { stage: 'Shortlisted', count: 0 },
        { stage: 'Interview', count: 0 },
        { stage: 'Offer', count: 0 },
        { stage: 'Hired', count: 0 },
        { stage: 'Rejected', count: 0 }
      ];
    }

    // 7. Chart Data - Candidates by Source
    let candidatesBySource = [];
    if (Candidate) {
      const sourceData = await Candidate.aggregate([
        {
          $match: { isActive: true }
        },
        {
          $group: {
            _id: '$source',
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            source: { $ifNull: ['$_id', 'other'] },
            count: 1
          }
        },
        {
          $sort: { count: -1 }
        }
      ]);

      // Map and format source names
      const sourceMap = new Map();
      sourceData.forEach(item => {
        const formattedSource = item.source === 'job-portal' ? 'Job Portal' :
                               item.source === 'walk-in' ? 'Walk-in' :
                               item.source.charAt(0).toUpperCase() + item.source.slice(1);
        sourceMap.set(item.source, { source: formattedSource, count: item.count });
      });

      const allSources = ['internal', 'linkedin', 'naukri', 'referral', 'job-portal', 'walk-in', 'other'];
      candidatesBySource = allSources.map(source => {
        if (sourceMap.has(source)) {
          return sourceMap.get(source);
        }
        const formattedSource = source === 'job-portal' ? 'Job Portal' :
                               source === 'walk-in' ? 'Walk-in' :
                               source.charAt(0).toUpperCase() + source.slice(1);
        return { source: formattedSource, count: 0 };
      });
    } else {
      // Default empty sources
      candidatesBySource = [
        { source: 'Internal', count: 0 },
        { source: 'Linkedin', count: 0 },
        { source: 'Naukri', count: 0 },
        { source: 'Referral', count: 0 },
        { source: 'Job Portal', count: 0 },
        { source: 'Walk-in', count: 0 },
        { source: 'Other', count: 0 }
      ];
    }

    console.log(`📊 Dashboard stats for company ${req.tenant.companyId}:`, {
      totalEmployees,
      activeEmployees,
      activeJobs,
      totalCandidates
    });

    res.status(200).json({
      success: true,
      data: {
        employees: {
          total: totalEmployees,
          active: activeEmployees
        },
        jobs: {
          active: activeJobs
        },
        candidates: {
          total: totalCandidates
        },
        charts: {
          employeeTrend: filledEmployeeTrend,
          jobOpeningsTrend: jobOpeningsTrend,
          candidatesByStage: candidatesByStage,
          candidatesBySource: candidatesBySource
        }
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get leave calendar data - shows employees on leave by date
exports.getLeaveCalendar = async (req, res) => {
  try {
    const tenantConnection = req.tenant.connection;
    const LeaveRequestSchema = require('../models/tenant/LeaveRequest');
    const LeaveRequest = tenantConnection.model('LeaveRequest', LeaveRequestSchema);
    const TenantUserSchema = require('../models/tenant/TenantUser');
    const TenantUser = tenantConnection.model('User', TenantUserSchema);
    
    const { startDate, endDate, department, leaveType } = req.query;
    
    // Default to current month if not provided
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    
    // Build query for approved leaves that overlap with the date range
    const query = {
      status: 'approved',
      $or: [
        { startDate: { $lte: end }, endDate: { $gte: start } }
      ]
    };
    
    if (leaveType) query.leaveType = leaveType;
    
    const leaves = await LeaveRequest.find(query)
      .populate('employeeId', 'firstName lastName email employeeCode departmentId')
      .sort({ startDate: 1 });
    
    // Filter by department if specified
    let filteredLeaves = leaves;
    if (department) {
      filteredLeaves = leaves.filter(leave => {
        const empDept = leave.employeeId?.departmentId?.toString();
        return empDept === department;
      });
    }
    
    res.status(200).json({
      success: true,
      data: filteredLeaves
    });
  } catch (error) {
    console.error('Error fetching leave calendar:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get HR Dashboard Stats
exports.getHRDashboardStats = async (req, res) => {
  try {
    const tenantConnection = req.tenant.connection;
    const TenantUserSchema = require('../models/tenant/TenantUser');
    const TenantUser = tenantConnection.model('User', TenantUserSchema);
    const LeaveRequestSchema = require('../models/tenant/LeaveRequest');
    const LeaveRequest = tenantConnection.model('LeaveRequest', LeaveRequestSchema);
    const { getTenantModel } = require('../utils/tenantModels');
    const Payroll = getTenantModel(tenantConnection, 'Payroll');
    const JobPosting = getTenantModel(tenantConnection, 'JobPosting');
    const Candidate = getTenantModel(tenantConnection, 'Candidate');
    const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
    
    // Employee stats
    const totalEmployees = await TenantUser.countDocuments({ 
      role: { $in: ['employee', 'manager'] },
      isActive: true 
    });
    
    // Leave stats
    const pendingLeaves = await LeaveRequest.countDocuments({ status: 'pending' });
    
    // Payroll stats
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();
    
    let payrollThisMonth = 0;
    if (Payroll) {
      const payrollData = await Payroll.aggregate([
        {
          $match: {
            month: currentMonth,
            year: currentYear
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$netSalary' }
          }
        }
      ]);
      payrollThisMonth = payrollData.length > 0 ? payrollData[0].total : 0;
    }
    
    // Job stats
    let openPositions = 0;
    if (JobPosting) {
      openPositions = await JobPosting.countDocuments({ status: 'active' });
    }
    
    // Recruitment stats
    let recruitment = {
      totalApplications: 0,
      shortlisted: 0,
      interviewScheduled: 0,
      selected: 0,
      rejected: 0
    };
    
    if (Candidate) {
      recruitment.totalApplications = await Candidate.countDocuments({ isActive: true });
      recruitment.shortlisted = await Candidate.countDocuments({ 
        isActive: true,
        stage: 'shortlisted'
      });
      recruitment.interviewScheduled = await Candidate.countDocuments({ 
        isActive: true,
        stage: 'interview'
      });
      recruitment.selected = await Candidate.countDocuments({ 
        isActive: true,
        stage: 'hired'
      });
      recruitment.rejected = await Candidate.countDocuments({ 
        isActive: true,
        stage: 'rejected'
      });
    }
    
    // Onboarding stats
    let onboarding = {
      total: 0,
      preboarding: 0,
      inProgress: 0,
      completed: 0
    };
    
    if (Onboarding) {
      onboarding.total = await Onboarding.countDocuments();
      onboarding.preboarding = await Onboarding.countDocuments({ status: 'preboarding' });
      onboarding.inProgress = await Onboarding.countDocuments({ status: 'in-progress' });
      onboarding.completed = await Onboarding.countDocuments({ status: 'completed' });
    }
    
    res.status(200).json({
      success: true,
      data: {
        totalEmployees,
        pendingLeaves,
        payrollThisMonth,
        openPositions,
        recruitment,
        onboarding
      }
    });
  } catch (error) {
    console.error('Error fetching HR dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
