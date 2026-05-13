const { getTenantModel } = require('../utils/tenantModels');
const {
  sendOffboardingInitiatedEmail,
  sendExitInterviewScheduledEmail,
  sendAssetReturnReminderEmail,
  sendClearanceProcessEmail,
  sendFinalSettlementEmail,
  sendOffboardingCompletedEmail,
  sendDocumentationStageEmail
} = require('../services/emailService');

// Debug: Check if sendDocumentationStageEmail is properly imported
// Nodemon restart trigger
console.log('🔍 Offboarding controller: sendDocumentationStageEmail imported:', typeof sendDocumentationStageEmail);

/**
 * Helper function to get employee details for email notifications
 */
const getEmployeeDetails = async (employeeId, req) => {
  try {
    console.log('🔍 getEmployeeDetails: Looking up employee ID:', employeeId);
    const TenantEmployee = getTenantModel(req.tenant.connection, 'Employee');
    const TenantUser = getTenantModel(req.tenant.connection, 'User');
    
    let employee = null;
    
    // First try Employee model
    if (TenantEmployee) {
      console.log('🔍 Trying Employee model...');
      employee = await TenantEmployee.findById(employeeId)
        .select('firstName lastName email employeeCode designation department')
        .lean();
      
      // Handle department population safely
      if (employee && employee.department) {
        try {
          const Department = getTenantModel(req.tenant.connection, 'Department');
          if (typeof employee.department === 'string') {
            // If it's a string, try to find the department by name or ObjectId
            const dept = await Department.findOne({
              $or: [
                { name: employee.department },
                { _id: employee.department.match(/^[0-9a-fA-F]{24}$/) ? employee.department : null }
              ]
            }).select('name').lean();
            if (dept) {
              employee.department = dept;
            } else {
              employee.department = { name: employee.department };
            }
          } else if (typeof employee.department === 'object' && !employee.department.name) {
            // Try to populate as ObjectId
            const dept = await Department.findById(employee.department).select('name').lean();
            if (dept) {
              employee.department = dept;
            }
          }
        } catch (deptErr) {
          console.warn(`Could not populate department for employee ${employeeId}:`, deptErr.message);
          if (typeof employee.department === 'string') {
            employee.department = { name: employee.department };
          }
        }
      }
      
      console.log('🔍 Employee model result:', employee ? {
        id: employee._id,
        name: `${employee.firstName} ${employee.lastName}`,
        email: employee.email
      } : 'Not found');
    }
    
    // If not found, try User model
    if (!employee && TenantUser) {
      console.log('🔍 Trying User model...');
      employee = await TenantUser.findById(employeeId)
        .select('firstName lastName email employeeCode designation departmentId')
        .lean();
      
      if (employee && employee.departmentId) {
        console.log('🔍 Populating department for User model...');
        const Department = getTenantModel(req.tenant.connection, 'Department');
        const dept = await Department.findById(employee.departmentId).select('name').lean();
        if (dept) {
          employee.department = dept;
        }
      }
      console.log('🔍 User model result:', employee ? {
        id: employee._id,
        name: `${employee.firstName} ${employee.lastName}`,
        email: employee.email
      } : 'Not found');
    }
    
    console.log('🔍 Final employee result:', employee ? 'Found' : 'Not found');
    return employee;
  } catch (error) {
    console.error('Error getting employee details:', error);
    return null;
  }
};

exports.getOffboardingList = async (req, res) => {
  try {
    // Get tenant-specific models
    const Offboarding = getTenantModel(req.tenant.connection, 'Offboarding');
    const TenantUser = getTenantModel(req.tenant.connection, 'User');
    
    const { 
      status, 
      stage, 
      page = 1, 
      limit = 10, 
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      startDate,
      endDate
    } = req.query;
    
    let query = {};

    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }

    // Filter by stage
    if (stage) {
      query.currentStage = stage;
    }

    // Date range filter
    if (startDate || endDate) {
      query.lastWorkingDate = {};
      if (startDate) query.lastWorkingDate.$gte = new Date(startDate);
      if (endDate) query.lastWorkingDate.$lte = new Date(endDate);
    }

    // Search functionality - search by employee name/email
    if (search) {
      // First, find employees matching the search
      const employeeIds = await TenantUser.find({
        role: 'employee',
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { employeeCode: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      
      const employeeIdArray = employeeIds.map(emp => emp._id);
      query.employee = { $in: employeeIdArray };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    let offboardingList = await Offboarding.find(query)
      .populate('initiatedBy', 'firstName lastName email')
      .populate('exitInterview.conductedBy', 'firstName lastName email')
      .populate('clearance.hr.clearedBy', 'firstName lastName')
      .populate('clearance.finance.clearedBy', 'firstName lastName')
      .populate('clearance.it.clearedBy', 'firstName lastName')
      .populate('clearance.admin.clearedBy', 'firstName lastName')
      .populate('assetsReturned.asset', 'name serialNumber')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Get tenant models for auto-fix and population
    const Department = getTenantModel(req.tenant.connection, 'Department');
    const TenantEmployee = getTenantModel(req.tenant.connection, 'Employee');
    
    // Auto-fix: Process completed offboardings that haven't been processed yet
    for (const offboarding of offboardingList) {
      if (offboarding.status === 'completed' && offboarding.currentStage === 'success') {
        if (offboarding.employee && TenantEmployee) {
          try {
            const employee = await TenantEmployee.findById(offboarding.employee);
            if (employee && !employee.isExEmployee) {
              console.log(`🔄 Auto-fix: Processing ex-employee logic for employee: ${employee.employeeCode}`);
              
              // Process this offboarding
              const offboardingWorkflow = require('../services/offboardingWorkflow');
              const offboardingRequest = {
                _id: offboarding._id,
                employeeId: offboarding.employee,
                reason: offboarding.reason || 'Offboarding completed',
                reasonDetails: offboarding.reason || '',
                lastWorkingDay: offboarding.lastWorkingDate || new Date(),
                status: 'closed',
                isCompleted: true
              };
              
              await offboardingWorkflow.completeOffboarding(req.tenant.connection, offboardingRequest);
              console.log(`✅ Auto-fix: Successfully processed ex-employee logic for ${employee.employeeCode}`);
            } else if (employee && employee.isExEmployee) {
              console.log(`ℹ️ Auto-fix: Employee ${employee.employeeCode} is already marked as ex-employee`);
            }
          } catch (err) {
            console.error(`❌ Auto-fix failed for offboarding ${offboarding._id}:`, err);
          }
        }
      }
    }

    // Manually populate employee data - try Employee model first, then User model
    
    for (let item of offboardingList) {
      if (item.employee) {
        try {
          let employee = null;
          
          // First try Employee model (most common case)
          if (TenantEmployee) {
            employee = await TenantEmployee.findById(item.employee)
              .select('firstName lastName email employeeCode designation department')
              .lean();
            
            // Handle department population safely
            if (employee && employee.department) {
              try {
                // If department is already an object, keep it
                if (typeof employee.department === 'object' && employee.department.name) {
                  // Already populated
                } else if (typeof employee.department === 'string') {
                  // If it's a string, try to find the department by name or ObjectId
                  const dept = await Department.findOne({
                    $or: [
                      { name: employee.department },
                      { _id: employee.department.match(/^[0-9a-fA-F]{24}$/) ? employee.department : null }
                    ]
                  }).select('name').lean();
                  if (dept) {
                    employee.department = dept;
                  } else {
                    employee.department = { name: employee.department };
                  }
                } else {
                  // Try to populate as ObjectId
                  const dept = await Department.findById(employee.department).select('name').lean();
                  if (dept) {
                    employee.department = dept;
                  }
                }
              } catch (deptErr) {
                console.warn(`Could not populate department for employee ${item.employee}:`, deptErr.message);
                // Keep original department value
                if (typeof employee.department === 'string') {
                  employee.department = { name: employee.department };
                }
              }
            }
          }
          
          // If not found in Employee model, try User model
          if (!employee && TenantUser) {
            employee = await TenantUser.findById(item.employee)
              .select('firstName lastName email employeeCode designation departmentId')
              .lean();
            
            if (employee) {
              // Populate department if it exists
              if (employee.departmentId && Department) {
                const dept = await Department.findById(employee.departmentId).select('name').lean();
                if (dept) {
                  employee.department = dept;
                }
              }
            }
          }
          
          if (employee) {
            item.employee = employee;
          } else {
            console.warn(`Employee not found for offboarding ${item._id}, employee ID: ${item.employee}`);
          }
        } catch (err) {
          console.error('Error populating employee:', err);
          // Keep employee as ObjectId if populate fails
        }
      }
    }

    // Get total count for pagination
    const total = await Offboarding.countDocuments(query);

    // Calculate summary statistics
    const allOffboardings = await Offboarding.find({}).select('status currentStage');
    const summary = {
      total: allOffboardings.length,
      inProgress: allOffboardings.filter(o => o.status === 'in-progress').length,
      completed: allOffboardings.filter(o => o.status === 'completed').length,
      cancelled: allOffboardings.filter(o => o.status === 'cancelled').length,
      byStage: {}
    };

    // Count by stage
    allOffboardings.forEach(off => {
      if (off.currentStage) {
        summary.byStage[off.currentStage] = (summary.byStage[off.currentStage] || 0) + 1;
      }
    });

    res.status(200).json({ 
      success: true, 
      count: offboardingList.length,
      data: offboardingList,
      summary,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching offboarding list:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getOffboarding = async (req, res) => {
  try {
    const Offboarding = getTenantModel(req.tenant.connection, 'Offboarding');
    const TenantUser = getTenantModel(req.tenant.connection, 'User');
    const Department = getTenantModel(req.tenant.connection, 'Department');
    
    let offboarding = await Offboarding.findById(req.params.id)
      .populate('initiatedBy', 'firstName lastName email')
      .populate('exitInterview.conductedBy', 'firstName lastName email')
      .populate('clearance.hr.clearedBy', 'firstName lastName email')
      .populate('clearance.finance.clearedBy', 'firstName lastName email')
      .populate('clearance.it.clearedBy', 'firstName lastName email')
      .populate('clearance.admin.clearedBy', 'firstName lastName email')
      .populate('assetsReturned.asset', 'name serialNumber category condition status')
      .lean();

    if (!offboarding) {
      return res.status(404).json({ success: false, message: 'Offboarding record not found' });
    }

    // Manually populate employee data - try Employee model first, then User model
    const TenantEmployee = getTenantModel(req.tenant.connection, 'Employee');
    
    if (offboarding.employee) {
      try {
        let employee = null;
        
        // First try Employee model (most common case)
        if (TenantEmployee) {
          employee = await TenantEmployee.findById(offboarding.employee)
            .select('firstName lastName email employeeCode designation department joiningDate dateOfJoining phone address')
            .lean();
          
          // Handle department population safely
          if (employee && employee.department) {
            try {
              if (typeof employee.department === 'string') {
                // If it's a string, try to find the department by name or ObjectId
                const dept = await Department.findOne({
                  $or: [
                    { name: employee.department },
                    { _id: employee.department.match(/^[0-9a-fA-F]{24}$/) ? employee.department : null }
                  ]
                }).select('name').lean();
                if (dept) {
                  employee.department = dept;
                } else {
                  employee.department = { name: employee.department };
                }
              } else if (typeof employee.department === 'object' && !employee.department.name) {
                // Try to populate as ObjectId
                const dept = await Department.findById(employee.department).select('name').lean();
                if (dept) {
                  employee.department = dept;
                }
              }
            } catch (deptErr) {
              console.warn(`Could not populate department for employee ${offboarding.employee}:`, deptErr.message);
              if (typeof employee.department === 'string') {
                employee.department = { name: employee.department };
              }
            }
          }
        }
        
        // If not found in Employee model, try User model
        if (!employee && TenantUser) {
          employee = await TenantUser.findById(offboarding.employee)
            .select('firstName lastName email employeeCode designation departmentId joiningDate dateOfJoining phone address')
            .lean();
          
          if (employee) {
            // Populate department if it exists
            if (employee.departmentId && Department) {
              const dept = await Department.findById(employee.departmentId).select('name').lean();
              if (dept) {
                employee.department = dept;
              }
            }
            
            // Populate reporting manager
            if (employee.reportingManager) {
              const manager = await TenantUser.findOne({ email: employee.reportingManager })
                .select('firstName lastName email')
                .lean();
              if (manager) {
                employee.reportingManager = manager;
              }
            }
          }
        }
        
        if (employee) {
          offboarding.employee = employee;
        } else {
          console.warn(`Employee not found for offboarding ${offboarding._id}, employee ID: ${offboarding.employee}`);
        }
      } catch (err) {
        console.error('Error populating employee:', err);
      }
    }

    // Calculate clearance summary
    const clearanceSummary = {
      hr: {
        cleared: offboarding.clearance?.hr?.cleared || false,
        clearedAt: offboarding.clearance?.hr?.clearedAt,
        clearedBy: offboarding.clearance?.hr?.clearedBy,
        notes: offboarding.clearance?.hr?.notes
      },
      finance: {
        cleared: offboarding.clearance?.finance?.cleared || false,
        clearedAt: offboarding.clearance?.finance?.clearedAt,
        clearedBy: offboarding.clearance?.finance?.clearedBy,
        notes: offboarding.clearance?.finance?.notes
      },
      it: {
        cleared: offboarding.clearance?.it?.cleared || false,
        clearedAt: offboarding.clearance?.it?.clearedAt,
        clearedBy: offboarding.clearance?.it?.clearedBy,
        notes: offboarding.clearance?.it?.notes
      },
      admin: {
        cleared: offboarding.clearance?.admin?.cleared || false,
        clearedAt: offboarding.clearance?.admin?.clearedAt,
        clearedBy: offboarding.clearance?.admin?.clearedBy,
        notes: offboarding.clearance?.admin?.notes
      }
    };

    // Count cleared departments
    const clearedCount = Object.values(clearanceSummary).filter(dept => dept.cleared).length;
    const totalDepartments = Object.keys(clearanceSummary).length;

    res.status(200).json({ 
      success: true, 
      data: {
        ...offboarding,
        clearanceSummary,
        clearanceProgress: {
          cleared: clearedCount,
          total: totalDepartments,
          percentage: Math.round((clearedCount / totalDepartments) * 100)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching offboarding:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createOffboarding = async (req, res) => {
  try {
    const Offboarding = getTenantModel(req.tenant.connection, 'Offboarding');
    const Employee = getTenantModel(req.tenant.connection, 'Employee');
    // Map frontend field names to backend field names
    const { employee, employeeId, lastWorkingDate, lastWorkingDay, resignationType, reason } = req.body;

    // Support both field names (employee/employeeId, lastWorkingDate/lastWorkingDay)
    const employeeIdValue = employee || employeeId;
    const lastWorkingDateValue = lastWorkingDate || lastWorkingDay;
    
    // Map reason to resignationType if resignationType is not provided
    let resignationTypeValue = resignationType;
    if (!resignationTypeValue && reason) {
      // Map reason enum values to resignationType enum values
      const reasonMap = {
        'voluntary_resignation': 'voluntary',
        'involuntary_termination': 'involuntary',
        'retirement': 'retirement',
        'contract_end': 'contract-end',
        'layoff': 'involuntary',
        'performance_issues': 'involuntary',
        'misconduct': 'involuntary',
        'mutual_agreement': 'voluntary',
        'other': 'voluntary'
      };
      resignationTypeValue = reasonMap[reason] || 'voluntary';
    }

    // Validate required fields
    if (!employeeIdValue) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID is required'
      });
    }

    if (!lastWorkingDateValue) {
      return res.status(400).json({
        success: false,
        message: 'Last working date is required'
      });
    }

    if (!resignationTypeValue) {
      return res.status(400).json({
        success: false,
        message: 'Resignation type is required'
      });
    }

    // Validate last working date format
    const lastWorkingDateObj = new Date(lastWorkingDateValue);
    if (isNaN(lastWorkingDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid last working date format'
      });
    }

    // Validate against employee joining date
    if (Employee) {
      const employeeRecord = await Employee.findById(employeeIdValue).select('joiningDate dateOfJoining firstName lastName');
      if (!employeeRecord) {
        return res.status(400).json({
          success: false,
          message: 'Employee not found for validating last working date'
        });
      }

      const joiningSource = employeeRecord.joiningDate || employeeRecord.dateOfJoining;
      if (joiningSource) {
        const joiningDateObj = new Date(joiningSource);
        if (!isNaN(joiningDateObj.getTime()) && lastWorkingDateObj <= joiningDateObj) {
          return res.status(400).json({
            success: false,
            message: 'Last working date must be after the employee joining date'
          });
        }
      }
    }

    // Initialize clearance status properly
    const clearanceStatus = {
      hr: { cleared: false },
      finance: { cleared: false },
      it: { cleared: false },
      admin: { cleared: false }
    };

    const offboarding = await Offboarding.create({
      employee: employeeIdValue,
      initiatedBy: req.user._id || req.user.id,
      lastWorkingDate: lastWorkingDateObj,
      resignationType: resignationTypeValue,
      reason: reason,
      stages: ['exitDiscussion', 'assetReturn', 'documentation', 'finalSettlement', 'success'],
      currentStage: 'exitDiscussion',
      status: 'in-progress',
      clearance: clearanceStatus,
      exitInterview: {
        completed: false
      },
      finalSettlement: {
        paymentStatus: 'pending'
      }
    });

    // Get employee details for logging and email
    console.log('🔍 Looking up employee data for ID:', employeeIdValue);
    const employeeData = Employee ? await Employee.findById(employeeIdValue) : null;
    console.log('🔍 Employee data found:', employeeData ? {
      id: employeeData._id,
      name: `${employeeData.firstName} ${employeeData.lastName}`,
      email: employeeData.email
    } : 'Not found');

    // Send offboarding initiated email to employee
    if (employeeData && employeeData.email) {
      console.log('📧 Attempting to send offboarding email to:', employeeData.email);
      try {
        await sendOffboardingInitiatedEmail({
          employeeName: `${employeeData.firstName} ${employeeData.lastName}`,
          employeeEmail: employeeData.email,
          lastWorkingDate: lastWorkingDateObj,
          resignationType: resignationTypeValue,
          companyName: req.tenant?.companyName || process.env.COMPANY_NAME || 'SPC MANAGMENT'
        });
        console.log(`📧 Offboarding initiated email sent to ${employeeData.email}`);
      } catch (emailError) {
        console.error('⚠️ Failed to send offboarding initiated email:', emailError.message);
        console.error('⚠️ Full email error:', emailError);
        // Don't fail the request if email fails
      }
    } else {
      console.log('⚠️ Cannot send email: employeeData or email missing', {
        employeeData: !!employeeData,
        email: employeeData?.email
      });
    }

    // Log HR activity
    if (employeeData) {
      try {
        const { logOffboardingCreated } = require('../services/hrActivityLogService');
        await logOffboardingCreated(req.tenant.connection, offboarding, employeeData, req);
        console.log(`📝 HR activity logged for offboarding creation: ${employeeData.firstName} ${employeeData.lastName}`);
      } catch (logError) {
        console.error('⚠️ Failed to log HR activity for offboarding creation:', logError.message);
      }
    }

    res.status(201).json({ success: true, message: 'Offboarding process initiated', data: offboarding });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateOffboarding = async (req, res) => {
  try {
    const Offboarding = getTenantModel(req.tenant.connection, 'Offboarding');
    const Employee = getTenantModel(req.tenant.connection, 'Employee');

    const offboarding = await Offboarding.findById(req.params.id);
    if (!offboarding) {
      return res.status(404).json({ success: false, message: 'Offboarding record not found' });
    }

    // If last working date is being updated, validate it against joining date
    const incomingLastWorking =
      req.body.lastWorkingDate || req.body.lastWorkingDay || req.body.lastWorkingDateValue;

    if (incomingLastWorking && Employee) {
      const lastWorkingDateObj = new Date(incomingLastWorking);
      if (isNaN(lastWorkingDateObj.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid last working date format'
        });
      }

      const employeeRecord = await Employee.findById(offboarding.employee).select('joiningDate dateOfJoining');
      if (employeeRecord) {
        const joiningSource = employeeRecord.joiningDate || employeeRecord.dateOfJoining;
        if (joiningSource) {
          const joiningDateObj = new Date(joiningSource);
          if (!isNaN(joiningDateObj.getTime()) && lastWorkingDateObj <= joiningDateObj) {
            return res.status(400).json({
              success: false,
              message: 'Last working date must be after the employee joining date'
            });
          }
        }
      }
    }

    Object.assign(offboarding, req.body);
    
    // Check if offboarding is being marked as completed
    const wasCompleted = offboarding.status === 'completed';
    const isNowCompleted = req.body.status === 'completed' || req.body.currentStage === 'success';
    
    await offboarding.save();
    
    // If offboarding is being marked as completed, process ex-employee logic
    if (!wasCompleted && isNowCompleted) {
      console.log(`🔄 Offboarding marked as completed, processing ex-employee logic for employee: ${offboarding.employee}`);
      
      try {
        const offboardingWorkflow = require('../services/offboardingWorkflow');
        const TenantEmployee = getTenantModel(req.tenant.connection, 'Employee');
        
        // Get the employee to verify they exist and are not already ex-employee
        const employee = await TenantEmployee.findById(offboarding.employee);
        if (employee && !employee.isExEmployee) {
          console.log(`🔄 Processing ex-employee logic for employee: ${employee.employeeCode}`);
          
          // Create a proper offboardingRequest object for the workflow
          const offboardingRequest = {
            _id: offboarding._id,
            employeeId: offboarding.employee,
            reason: offboarding.reason || 'Offboarding completed',
            reasonDetails: offboarding.reason || '',
            lastWorkingDay: offboarding.lastWorkingDate || new Date(),
            status: 'closed',
            isCompleted: true,
            save: async function() { 
              await this.save();
              return this;
            }
          };
          
          await offboardingWorkflow.completeOffboarding(req.tenant.connection, offboardingRequest);
          console.log(`✅ Successfully processed ex-employee logic for ${employee.employeeCode}`);
        } else if (employee && employee.isExEmployee) {
          console.log(`ℹ️ Employee ${employee.employeeCode} is already marked as ex-employee`);
        } else {
          console.warn(`⚠️ Employee not found for ID: ${offboarding.employee}`);
        }
      } catch (exEmployeeError) {
        console.error('❌ Error processing ex-employee:', exEmployeeError);
        // Don't fail the update if ex-employee processing fails
      }
    }

    res.status(200).json({ success: true, message: 'Offboarding updated successfully', data: offboarding });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.advanceStage = async (req, res) => {
  try {
    const Offboarding = getTenantModel(req.tenant.connection, 'Offboarding');
    const offboarding = await Offboarding.findById(req.params.id);
    if (!offboarding) {
      return res.status(404).json({ success: false, message: 'Offboarding record not found' });
    }

    const currentIndex = offboarding.stages.indexOf(offboarding.currentStage);
    console.log('🔍 advanceStage: Current stage:', offboarding.currentStage);
    console.log('🔍 advanceStage: All stages:', offboarding.stages);
    console.log('🔍 advanceStage: Current index:', currentIndex);
    
    if (currentIndex < offboarding.stages.length - 1) {
      const previousStage = offboarding.currentStage;
      const previousStatus = offboarding.status;

      offboarding.currentStage = offboarding.stages[currentIndex + 1];
      console.log('🔍 advanceStage: New stage:', offboarding.currentStage);

      // If reached success stage OR if status is being set to completed, mark as completed and process ex-employee logic
      if (offboarding.currentStage === 'success' || offboarding.status === 'completed') {
        // Ensure status is set to completed
        offboarding.status = 'completed';
        offboarding.completedAt = Date.now();
        
        // Process ex-employee logic using the workflow service
        try {
          const offboardingWorkflow = require('../services/offboardingWorkflow');
          const TenantEmployee = getTenantModel(req.tenant.connection, 'Employee');
          
          // Get the employee to verify they exist and are not already ex-employee
          const employee = await TenantEmployee.findById(offboarding.employee);
          if (employee && !employee.isExEmployee) {
            console.log(`🔄 Processing ex-employee logic for employee: ${employee.employeeCode} (stage: ${offboarding.currentStage}, status: ${offboarding.status})`);
            
            // Create a proper offboardingRequest object for the workflow
            const offboardingRequest = {
              _id: offboarding._id,
              employeeId: offboarding.employee,
              reason: offboarding.reason || 'Offboarding completed',
              reasonDetails: offboarding.reason || '',
              lastWorkingDay: offboarding.lastWorkingDate || new Date(),
              status: 'closed',
              isCompleted: true,
              save: async function() { 
                await this.save();
                return this;
              }
            };
            
            await offboardingWorkflow.completeOffboarding(req.tenant.connection, offboardingRequest);
            console.log(`✅ Successfully processed ex-employee logic for ${employee.employeeCode}`);
          } else if (employee && employee.isExEmployee) {
            console.log(`ℹ️ Employee ${employee.employeeCode} is already marked as ex-employee`);
          } else {
            console.warn(`⚠️ Employee not found for ID: ${offboarding.employee}`);
          }
        } catch (exEmployeeError) {
          console.error('❌ Error processing ex-employee:', exEmployeeError);
          // Don't fail the stage advancement if ex-employee processing fails
        }
      }

      await offboarding.save();

      // Get employee details for email notifications
      console.log('🔍 advanceStage: Getting employee details for ID:', offboarding.employee);
      const employeeDetails = await getEmployeeDetails(offboarding.employee, req);

      // Send stage-specific email notifications
      if (employeeDetails && employeeDetails.email) {
        console.log('📧 advanceStage: Attempting to send stage email for stage:', offboarding.currentStage);
        try {
          const companyName = req.tenant?.companyName || process.env.COMPANY_NAME || 'SPC MANAGMENT';
          const employeeName = `${employeeDetails.firstName} ${employeeDetails.lastName}`;
          const employeeEmail = employeeDetails.email;

          console.log('📧 advanceStage: Sending email to:', employeeEmail, 'for stage:', offboarding.currentStage);

          switch (offboarding.currentStage) {
            case 'assetReturn':
              await sendAssetReturnReminderEmail({
                employeeName,
                employeeEmail,
                companyName
              });
              console.log(`📧 Asset return reminder email sent to ${employeeEmail}`);
              break;
            
            case 'documentation':
              console.log('📧 advanceStage: Entering documentation case');
              // Send documentation stage email with clearance status
              console.log('📧 advanceStage: About to call sendDocumentationStageEmail');
              await sendDocumentationStageEmail({
                employeeName,
                employeeEmail,
                clearanceStatus: offboarding.clearance,
                companyName
              });
              console.log('📧 advanceStage: sendDocumentationStageEmail completed');
              
              // Also send individual clearance process emails for any completed clearances
              let clearanceEmailsSent = 0;
              ['hr', 'finance', 'it', 'admin'].forEach(dept => {
                if (offboarding.clearance[dept]?.cleared) {
                  clearanceEmailsSent++;
                  sendClearanceProcessEmail({
                    employeeName,
                    employeeEmail,
                    department: dept.charAt(0).toUpperCase() + dept.slice(1),
                    cleared: true,
                    notes: offboarding.clearance[dept]?.notes,
                    companyName
                  }).catch(err => console.error(`Failed to send ${dept} clearance email:`, err.message));
                }
              });
              
              console.log(`📧 Documentation stage email sent to ${employeeEmail}${clearanceEmailsSent > 0 ? ` (${clearanceEmailsSent} clearance emails also sent)` : ''}`);
              break;
            
            case 'finalSettlement':
              await sendFinalSettlementEmail({
                employeeName,
                employeeEmail,
                amount: offboarding.finalSettlement?.amount,
                paymentStatus: offboarding.finalSettlement?.paymentStatus,
                companyName
              });
              console.log(`📧 Final settlement email sent to ${employeeEmail}`);
              break;
            
            case 'success':
              // Always send documentation email if not already sent, then send completion email
              console.log('📧 advanceStage: Entering success case - sending documentation email first');
              await sendDocumentationStageEmail({
                employeeName,
                employeeEmail,
                clearanceStatus: offboarding.clearance,
                companyName
              });
              console.log('📧 advanceStage: Documentation email sent in success stage');
              
              await sendOffboardingCompletedEmail({
                employeeName,
                employeeEmail,
                companyName
              });
              console.log(`📧 Offboarding completed email sent to ${employeeEmail}`);
              break;
          }
        } catch (emailError) {
          console.error('⚠️ Failed to send stage notification email:', emailError.message);
          console.error('⚠️ Full email error:', emailError);
          // Don't fail the request if email fails
        }
      } else {
        console.log('⚠️ advanceStage: Cannot send email - employeeDetails or email missing', {
          employeeDetails: !!employeeDetails,
          email: employeeDetails?.email,
          employeeId: offboarding.employee
        });
      }

      // Log HR activity
      try {
        const { logOffboardingStatusChanged } = require('../services/hrActivityLogService');
        await logOffboardingStatusChanged(req.tenant.connection, offboarding, previousStatus, offboarding.status, req);
        console.log(`📝 HR activity logged for offboarding stage change: ${offboarding.employeeName} - ${previousStage} → ${offboarding.currentStage}`);
      } catch (logError) {
        console.error('⚠️ Failed to log HR activity for offboarding stage change:', logError.message);
      }

      res.status(200).json({ success: true, message: 'Stage advanced successfully', data: offboarding });
    } else {
      res.status(400).json({ success: false, message: 'Already at final stage' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.scheduleExitInterview = async (req, res) => {
  try {
    const Offboarding = getTenantModel(req.tenant.connection, 'Offboarding');
    const { scheduledDate, conductedBy } = req.body;
    const offboarding = await Offboarding.findById(req.params.id);

    if (!offboarding) {
      return res.status(404).json({ success: false, message: 'Offboarding record not found' });
    }

    offboarding.exitInterview.scheduledDate = scheduledDate;
    offboarding.exitInterview.conductedBy = conductedBy;
    await offboarding.save();

    // Send exit interview scheduled email to employee
    const employeeDetails = await getEmployeeDetails(offboarding.employee, req);
    if (employeeDetails && employeeDetails.email) {
      try {
        // Get interviewer name if conductedBy is provided
        let interviewerName = null;
        if (conductedBy) {
          const TenantUser = getTenantModel(req.tenant.connection, 'User');
          const interviewer = await TenantUser.findById(conductedBy).select('firstName lastName').lean();
          if (interviewer) {
            interviewerName = `${interviewer.firstName} ${interviewer.lastName}`;
          }
        }

        await sendExitInterviewScheduledEmail({
          employeeName: `${employeeDetails.firstName} ${employeeDetails.lastName}`,
          employeeEmail: employeeDetails.email,
          scheduledDate,
          interviewerName,
          companyName: req.tenant?.companyName || process.env.COMPANY_NAME || 'SPC MANAGMENT'
        });
        console.log(`📧 Exit interview scheduled email sent to ${employeeDetails.email}`);
      } catch (emailError) {
        console.error('⚠️ Failed to send exit interview scheduled email:', emailError.message);
        // Don't fail the request if email fails
      }
    }

    res.status(200).json({ success: true, message: 'Exit interview scheduled', data: offboarding });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.completeExitInterview = async (req, res) => {
  try {
    const Offboarding = getTenantModel(req.tenant.connection, 'Offboarding');
    const { feedback } = req.body;
    const offboarding = await Offboarding.findById(req.params.id);

    if (!offboarding) {
      return res.status(404).json({ success: false, message: 'Offboarding record not found' });
    }

    offboarding.exitInterview.feedback = feedback;
    offboarding.exitInterview.completed = true;
    await offboarding.save();

    res.status(200).json({ success: true, message: 'Exit interview completed', data: offboarding });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.recordAssetReturn = async (req, res) => {
  try {
    const Offboarding = getTenantModel(req.tenant.connection, 'Offboarding');
    const { asset, condition } = req.body;
    const offboarding = await Offboarding.findById(req.params.id);

    if (!offboarding) {
      return res.status(404).json({ success: false, message: 'Offboarding record not found' });
    }

    offboarding.assetsReturned.push({
      asset,
      returnedDate: Date.now(),
      condition
    });

    await offboarding.save();

    res.status(200).json({ success: true, message: 'Asset return recorded', data: offboarding });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateClearance = async (req, res) => {
  try {
    const Offboarding = getTenantModel(req.tenant.connection, 'Offboarding');
    const { department, cleared, notes } = req.body;
    const offboarding = await Offboarding.findById(req.params.id);

    if (!offboarding) {
      return res.status(404).json({ success: false, message: 'Offboarding record not found' });
    }

    if (!offboarding.clearance[department]) {
      return res.status(400).json({ success: false, message: 'Invalid department' });
    }

    offboarding.clearance[department].cleared = cleared;
    offboarding.clearance[department].clearedBy = req.user.employeeId;
    offboarding.clearance[department].clearedAt = Date.now();
    offboarding.clearance[department].notes = notes;

    await offboarding.save();

    // Send clearance process email to employee
    const employeeDetails = await getEmployeeDetails(offboarding.employee, req);
    if (employeeDetails && employeeDetails.email) {
      try {
        await sendClearanceProcessEmail({
          employeeName: `${employeeDetails.firstName} ${employeeDetails.lastName}`,
          employeeEmail: employeeDetails.email,
          department: department.charAt(0).toUpperCase() + department.slice(1),
          cleared,
          notes,
          companyName: req.tenant?.companyName || process.env.COMPANY_NAME || 'SPC MANAGMENT'
        });
        console.log(`📧 ${department} clearance email sent to ${employeeDetails.email}`);
      } catch (emailError) {
        console.error('⚠️ Failed to send clearance email:', emailError.message);
        // Don't fail the request if email fails
      }
    }

    res.status(200).json({ success: true, message: 'Clearance updated', data: offboarding });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.processFinalSettlement = async (req, res) => {
  try {
    const Offboarding = getTenantModel(req.tenant.connection, 'Offboarding');
    const { amount, paymentStatus } = req.body;
    const offboarding = await Offboarding.findById(req.params.id);

    if (!offboarding) {
      return res.status(404).json({ success: false, message: 'Offboarding record not found' });
    }

    offboarding.finalSettlement.amount = amount;
    offboarding.finalSettlement.paymentDate = Date.now();
    offboarding.finalSettlement.paymentStatus = paymentStatus || 'processed';

    await offboarding.save();

    // Send final settlement email to employee
    const employeeDetails = await getEmployeeDetails(offboarding.employee, req);
    if (employeeDetails && employeeDetails.email) {
      try {
        await sendFinalSettlementEmail({
          employeeName: `${employeeDetails.firstName} ${employeeDetails.lastName}`,
          employeeEmail: employeeDetails.email,
          amount,
          paymentStatus: paymentStatus || 'processed',
          companyName: req.tenant?.companyName || process.env.COMPANY_NAME || 'SPC MANAGMENT'
        });
        console.log(`📧 Final settlement email sent to ${employeeDetails.email}`);
      } catch (emailError) {
        console.error('⚠️ Failed to send final settlement email:', emailError.message);
        // Don't fail the request if email fails
      }
    }

    res.status(200).json({ success: true, message: 'Final settlement processed', data: offboarding });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.cancelOffboarding = async (req, res) => {
  try {
    const Offboarding = getTenantModel(req.tenant.connection, 'Offboarding');
    const { reason } = req.body;
    const offboarding = await Offboarding.findById(req.params.id);

    if (!offboarding) {
      return res.status(404).json({ success: false, message: 'Offboarding record not found' });
    }

    if (offboarding.status === 'completed') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot cancel a completed offboarding process' 
      });
    }

    offboarding.status = 'cancelled';
    if (reason) {
      offboarding.notes = (offboarding.notes || '') + `\n[Cancelled] ${reason}`;
    }
    offboarding.completedAt = new Date();

    await offboarding.save();

    res.status(200).json({ success: true, message: 'Offboarding cancelled successfully', data: offboarding });
  } catch (error) {
    console.error('Error cancelling offboarding:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOffboarding = async (req, res) => {
  try {
    const Offboarding = getTenantModel(req.tenant.connection, 'Offboarding');
    const offboarding = await Offboarding.findByIdAndDelete(req.params.id);
    if (!offboarding) {
      return res.status(404).json({ success: false, message: 'Offboarding record not found' });
    }
    res.status(200).json({ success: true, message: 'Offboarding deleted successfully' });
  } catch (error) {
    console.error('Error deleting offboarding:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
