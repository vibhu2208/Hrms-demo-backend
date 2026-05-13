/**

 * Contract Management Controller

 * Handles all contract-related operations for tenant employees

 */



const tenantConnectionManager = require('../config/tenantConnection');

const emailService = require('../services/emailService');

const { getTenantModel } = require('../middlewares/tenantMiddleware');



/**

 * Generate unique contract number

 */

const generateContractNumber = async (Contract) => {

  const year = new Date().getFullYear();

  const prefix = `CON-${year}-`;

  

  // Find the latest contract number for this year

  const latestContract = await Contract.findOne({

    contractNumber: { $regex: `^${prefix}` }

  }).sort({ contractNumber: -1 });

  

  let nextNumber = 1;

  if (latestContract) {

    const lastNumber = parseInt(latestContract.contractNumber.split('-').pop());

    nextNumber = lastNumber + 1;

  }

  

  return `${prefix}${String(nextNumber).padStart(4, '0')}`;

};



/**

 * Create a new contract

 * POST /api/contracts

 */

exports.createContract = async (req, res) => {

  try {

    // Get tenant connection from middleware (like employee controller)

    const tenantConnection = req.tenant.connection;

    const contractSchema = require('../models/tenant/Contract');

    const tenantEmployeeSchema = require('../models/tenant/TenantEmployee');

    

    const Contract = getTenantModel(tenantConnection, 'Contract', contractSchema);

    const TenantEmployee = getTenantModel(tenantConnection, 'Employee', tenantEmployeeSchema);

    

    const {

      employeeId,

      contractType,

      title,

      description,

      startDate,

      endDate,

      deliverables,

      totalAmount,

      rateAmount,

      ratePeriod,

      hourlyRate,

      estimatedHours,

      maxHoursPerWeek,

      paymentTerms,

      invoiceCycle,

      isRenewable,

      autoRenew,

      renewalTerms,

      renewalReminderDays,

      documents

    } = req.body;

    

    // Validate employee exists

    const employee = await TenantEmployee.findById(employeeId);

    if (!employee) {

      return res.status(404).json({

        success: false,

        message: 'Employee not found'

      });

    }

    

    // Generate contract number

    const contractNumber = await generateContractNumber(Contract);

    

    // Create contract data

    const contractData = {

      employeeId: employee._id,

      employeeCode: employee.employeeCode,

      employeeName: `${employee.firstName} ${employee.lastName}`,

      employeeEmail: employee.email,

      contractType,

      contractNumber,

      title,

      description,

      startDate,

      endDate,

      paymentTerms,

      invoiceCycle: invoiceCycle || 'monthly',

      isRenewable: isRenewable || false,

      autoRenew: autoRenew || false,

      renewalTerms,

      renewalReminderDays: renewalReminderDays || 30,

      documents: documents || [],

      createdBy: req.user.id,

      status: 'draft'

    };

    

    // Add type-specific fields

    if (contractType === 'fixed-deliverable') {

      contractData.deliverables = deliverables || [];

      contractData.totalAmount = totalAmount || 0;

    } else if (contractType === 'rate-based') {

      contractData.rateAmount = rateAmount;

      contractData.ratePeriod = ratePeriod || 'monthly';

    } else if (contractType === 'hourly-based') {

      contractData.hourlyRate = hourlyRate;

      contractData.estimatedHours = estimatedHours;

      contractData.maxHoursPerWeek = maxHoursPerWeek;

    }

    

    // Create contract

    const contract = await Contract.create(contractData);

    

    // Update employee employment type and contract reference
    const employmentTypeMap = {
      'fixed-deliverable': 'deliverable-based',
      'rate-based': 'rate-based',
      'hourly-based': 'hourly-based'
    };

    

    employee.employmentType = employmentTypeMap[contractType];

    employee.contractId = contract._id;

    employee.hasActiveContract = false; // Will be true when contract is approved/activated

    await employee.save();

    

    // Send email notification to employee

    try {

      const emailSubject = `New Contract Created - ${contract.contractNumber}`;

      const emailBody = `

        <!DOCTYPE html>

        <html>

        <head>

          <style>

            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }

            .container { max-width: 600px; margin: 0 auto; padding: 20px; }

            .header { background-color: #4f46e5; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; }

            .content { background-color: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }

            .detail-row { padding: 10px 0; border-bottom: 1px solid #eee; }

            .detail-label { font-weight: bold; display: inline-block; width: 150px; }

            .button { display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }

          </style>

        </head>

        <body>

          <div class="container">

            <div class="header">

              <h2 style="margin: 0;">New Contract Created</h2>

            </div>

            <div class="content">

              <p>Dear ${employee.firstName} ${employee.lastName},</p>

              <p>A new contract has been created for you. Please review the details below:</p>

              

              <div class="detail-row">

                <span class="detail-label">Contract Number:</span>

                <span>${contract.contractNumber}</span>

              </div>

              <div class="detail-row">

                <span class="detail-label">Contract Title:</span>

                <span>${contract.title}</span>

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

                <span class="detail-label">End Date:</span>

                <span>${new Date(contract.endDate).toLocaleDateString()}</span>

              </div>

              <div class="detail-row">

                <span class="detail-label">Status:</span>

                <span>Pending Approval</span>

              </div>

              

              <p style="margin-top: 20px;">

                Your contract is currently pending approval. You will be notified once it has been reviewed and approved.

              </p>

              

              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/contracts/${contract._id}" class="button">

                View Contract Details

              </a>

            </div>

          </div>

        </body>

        </html>

      `;

      

      await emailService.sendEmail({

        to: employee.email,

        subject: emailSubject,

        html: emailBody

      });

      

      console.log(`✅ Contract creation email sent to ${employee.email}`);

    } catch (emailError) {

      console.error('Error sending contract creation email:', emailError);

      // Don't fail the contract creation if email fails

    }

    

    // Optionally create a project from this contract
    try {
      const projectData = {
        name: `Project - ${contract.title}`,
        description: contract.description,
        client: employee._id, // Use employee as client reference
        location: 'Remote', // Default location
        startDate: contract.startDate,
        endDate: contract.endDate,
        contractId: contract._id,
        createdBy: req.user.id,
        status: 'active',
        priority: 'medium'
      };
      
      const Project = getTenantModel(tenantConnection, 'Project', require('../models/tenant/Project'));
      const project = await Project.create(projectData);
      
      console.log(`✅ Project created from contract: ${project.name} (${project._id})`);
      
    } catch (projectError) {
      console.error('Error creating project from contract:', projectError);
      // Don't fail the contract creation if project creation fails
    }
    
    res.status(201).json({

      success: true,

      message: 'Contract created successfully',

      data: contract

    });

  } catch (error) {

    console.error('Error creating contract:', error);

    res.status(500).json({

      success: false,

      message: 'Failed to create contract',

      error: error.message

    });

  }

};



/**

 * Get all contracts with filters

 * GET /api/contracts

 */

exports.getContracts = async (req, res) => {

  try {

    // Get tenant connection from middleware

    const tenantConnection = req.tenant.connection;

    const contractSchema = require('../models/tenant/Contract');

    const Contract = getTenantModel(tenantConnection, 'Contract', contractSchema);

    

    const {

      status,

      contractType,

      employeeId,

      expiringSoon,

      page = 1,

      limit = 10,

      sortBy = 'createdAt',

      sortOrder = 'desc'

    } = req.query;

    

    // Build query

    const query = {};

    

    if (status) query.status = status;

    if (contractType) query.contractType = contractType;

    if (employeeId) query.employeeId = employeeId;

    

    if (expiringSoon === 'true') {

      const futureDate = new Date();

      futureDate.setDate(futureDate.getDate() + 30);

      query.endDate = {

        $gte: new Date(),

        $lte: futureDate

      };

      query.status = 'active';

    }

    

    // Pagination

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    

    const [contracts, total] = await Promise.all([

      Contract.find(query)

        .sort(sort)

        .skip(skip)

        .limit(parseInt(limit))

        .lean(),

      Contract.countDocuments(query)

    ]);

    

    // Calculate additional fields for each contract

    const enrichedContracts = contracts.map(contract => {

      const today = new Date();

      const daysUntilExpiry = Math.ceil((new Date(contract.endDate) - today) / (1000 * 60 * 60 * 24));

      

      return {

        ...contract,

        daysUntilExpiry,

        isExpiringSoon: daysUntilExpiry <= contract.renewalReminderDays && daysUntilExpiry > 0,

        isExpired: new Date(contract.endDate) < today

      };

    });

    

    res.json({

      success: true,

      data: enrichedContracts,

      pagination: {

        total,

        page: parseInt(page),

        limit: parseInt(limit),

        pages: Math.ceil(total / parseInt(limit))

      }

    });

  } catch (error) {

    console.error('Error fetching contracts:', error);

    res.status(500).json({

      success: false,

      message: 'Failed to fetch contracts',

      error: error.message

    });

  }

};



/**

 * Get contract by ID

 * GET /api/contracts/:id

 */

exports.getContractById = async (req, res) => {

  try {

    console.log('🔍 Fetching contract with ID:', req.params.id);

    console.log('🏢 Tenant context available:', !!req.tenant);

    

    // Get tenant connection from middleware

    const tenantConnection = req.tenant.connection;

    const contractSchema = require('../models/tenant/Contract');

    const Contract = getTenantModel(tenantConnection, 'Contract', contractSchema);

    

    console.log('📊 Contract model created successfully');

    

    const contract = await Contract.findById(req.params.id).lean();

    

    console.log('📄 Contract query result:', contract ? 'Found' : 'Not found');

    

    if (!contract) {

      return res.status(404).json({

        success: false,

        message: 'Contract not found'

      });

    }

    

    // Calculate additional fields

    const today = new Date();

    const daysUntilExpiry = Math.ceil((new Date(contract.endDate) - today) / (1000 * 60 * 60 * 24));

    

    const enrichedContract = {

      ...contract,

      daysUntilExpiry,

      isExpiringSoon: daysUntilExpiry <= contract.renewalReminderDays && daysUntilExpiry > 0,

      isExpired: new Date(contract.endDate) < today

    };

    

    res.json({

      success: true,

      data: enrichedContract

    });

  } catch (error) {

    console.error('❌ Error fetching contract:', error);

    console.error('❌ Error stack:', error.stack);

    res.status(500).json({

      success: false,

      message: 'Failed to fetch contract',

      error: error.message

    });

  }

};



/**

 * Update contract

 * PUT /api/contracts/:id

 */

exports.updateContract = async (req, res) => {

  try {

    // Get tenant connection from middleware

    const tenantConnection = req.tenant.connection;

    const contractSchema = require('../models/tenant/Contract');

    const Contract = getTenantModel(tenantConnection, 'Contract', contractSchema);

    

    const contract = await Contract.findById(req.params.id);

    

    if (!contract) {

      return res.status(404).json({

        success: false,

        message: 'Contract not found'

      });

    }

    

    // Don't allow updates to certain fields if contract is active

    if (contract.status === 'active') {

      const allowedFields = [

        'description',

        'notes',

        'paymentTerms',

        'documents',

        'actualHours',

        'deliverables'

      ];

      

      const updateFields = Object.keys(req.body);

      const hasRestrictedUpdates = updateFields.some(field => !allowedFields.includes(field));

      

      if (hasRestrictedUpdates) {

        return res.status(400).json({

          success: false,

          message: 'Cannot modify core contract details for active contracts. Only description, notes, documents, and progress can be updated.'

        });

      }

    }

    

    // Update contract

    Object.assign(contract, req.body);

    contract.lastModifiedBy = req.user.id;

    

    await contract.save();

    

    res.json({

      success: true,

      message: 'Contract updated successfully',

      data: contract

    });

  } catch (error) {

    console.error('Error updating contract:', error);

    res.status(500).json({

      success: false,

      message: 'Failed to update contract',

      error: error.message

    });

  }

};



/**

 * Approve contract

 * POST /api/contracts/:id/approve

 */

exports.approveContract = async (req, res) => {

  try {

    // Get tenant connection from middleware

    const tenantConnection = req.tenant.connection;

    const contractSchema = require('../models/tenant/Contract');

    const tenantEmployeeSchema = require('../models/tenant/TenantEmployee');

    

    const Contract = getTenantModel(tenantConnection, 'Contract', contractSchema);

    const TenantEmployee = getTenantModel(tenantConnection, 'Employee', tenantEmployeeSchema);

    

    const contract = await Contract.findById(req.params.id);

    

    if (!contract) {

      return res.status(404).json({

        success: false,

        message: 'Contract not found'

      });

    }

    

    if (contract.approvalStatus === 'approved') {

      return res.status(400).json({

        success: false,

        message: 'Contract is already approved'

      });

    }

    

    // Update contract

    contract.approvalStatus = 'approved';

    contract.approvedBy = req.user.id;

    contract.approvedDate = new Date();

    contract.status = 'active';

    

    await contract.save();

    

    // Update employee - activate employee when contract is approved
    const employee = await TenantEmployee.findById(contract.employeeId);
    if (employee) {
      employee.hasActiveContract = true;
      // Change status from contract-pending to active
      if (employee.status === 'contract-pending') {
        employee.status = 'active';
        console.log(`✅ Employee ${employee.firstName} ${employee.lastName} activated after contract approval`);
      }
      await employee.save();
    }

    

    res.json({

      success: true,

      message: 'Contract approved successfully',

      data: contract

    });

  } catch (error) {

    console.error('Error approving contract:', error);

    res.status(500).json({

      success: false,

      message: 'Failed to approve contract',

      error: error.message

    });

  }

};



/**

 * Reject contract

 * POST /api/contracts/:id/reject

 */

exports.rejectContract = async (req, res) => {

  try {

    // Get tenant connection from middleware

    const tenantConnection = req.tenant.connection;

    const contractSchema = require('../models/tenant/Contract');

    const Contract = getTenantModel(tenantConnection, 'Contract', contractSchema);

    

    const { rejectionReason } = req.body;

    

    if (!rejectionReason) {

      return res.status(400).json({

        success: false,

        message: 'Rejection reason is required'

      });

    }

    

    const contract = await Contract.findById(req.params.id);

    

    if (!contract) {

      return res.status(404).json({

        success: false,

        message: 'Contract not found'

      });

    }

    

    contract.approvalStatus = 'rejected';

    contract.rejectionReason = rejectionReason;

    contract.status = 'draft';

    

    await contract.save();

    

    res.json({

      success: true,

      message: 'Contract rejected',

      data: contract

    });

  } catch (error) {

    console.error('Error rejecting contract:', error);

    res.status(500).json({

      success: false,

      message: 'Failed to reject contract',

      error: error.message

    });

  }

};



/**

 * Renew contract

 * POST /api/contracts/:id/renew

 */

exports.renewContract = async (req, res) => {

  try {

    // Get tenant connection from middleware

    const tenantConnection = req.tenant.connection;

    const contractSchema = require('../models/tenant/Contract');

    const Contract = getTenantModel(tenantConnection, 'Contract', contractSchema);

    

    const { newEndDate, notes } = req.body;

    

    if (!newEndDate) {

      return res.status(400).json({

        success: false,

        message: 'New end date is required'

      });

    }

    

    const contract = await Contract.findById(req.params.id);

    

    if (!contract) {

      return res.status(404).json({

        success: false,

        message: 'Contract not found'

      });

    }

    

    if (!contract.isRenewable) {

      return res.status(400).json({

        success: false,

        message: 'Contract is not renewable'

      });

    }

    

    // Renew the contract

    await contract.renewContract(new Date(newEndDate), req.user.id, notes);

    

    res.json({

      success: true,

      message: 'Contract renewed successfully',

      data: contract

    });

  } catch (error) {

    console.error('Error renewing contract:', error);

    res.status(500).json({

      success: false,

      message: 'Failed to renew contract',

      error: error.message

    });

  }

};



/**

 * Terminate contract

 * POST /api/contracts/:id/terminate

 */

exports.terminateContract = async (req, res) => {

  try {

    // Get tenant connection from middleware

    const tenantConnection = req.tenant.connection;

    const contractSchema = require('../models/tenant/Contract');

    const tenantEmployeeSchema = require('../models/tenant/TenantEmployee');

    

    const Contract = getTenantModel(tenantConnection, 'Contract', contractSchema);

    const TenantEmployee = getTenantModel(tenantConnection, 'Employee', tenantEmployeeSchema);

    

    const { terminationReason, terminationDate } = req.body;

    

    if (!terminationReason) {

      return res.status(400).json({

        success: false,

        message: 'Termination reason is required'

      });

    }

    

    const contract = await Contract.findById(req.params.id);

    

    if (!contract) {

      return res.status(404).json({

        success: false,

        message: 'Contract not found'

      });

    }

    

    if (contract.status === 'terminated') {

      return res.status(400).json({

        success: false,

        message: 'Contract is already terminated'

      });

    }

    

    // Terminate contract

    contract.status = 'terminated';

    contract.terminationDate = terminationDate ? new Date(terminationDate) : new Date();

    contract.terminationReason = terminationReason;

    contract.terminatedBy = req.user.id;

    

    await contract.save();

    

    // Update employee

    const employee = await TenantEmployee.findById(contract.employeeId);

    if (employee) {

      employee.hasActiveContract = false;

      await employee.save();

    }

    

    res.json({

      success: true,

      message: 'Contract terminated successfully',

      data: contract

    });

  } catch (error) {

    console.error('Error terminating contract:', error);

    res.status(500).json({

      success: false,

      message: 'Failed to terminate contract',

      error: error.message

    });

  }

};



/**

 * Get contract statistics

 * GET /api/contracts/stats

 */

exports.getContractStats = async (req, res) => {

  try {

    // Get tenant connection from middleware

    const tenantConnection = req.tenant.connection;

    const contractSchema = require('../models/tenant/Contract');

    const Contract = getTenantModel(tenantConnection, 'Contract', contractSchema);

    

    const today = new Date();

    const thirtyDaysFromNow = new Date();

    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    

    const [

      totalContracts,

      activeContracts,

      expiringContracts,

      expiredContracts,

      contractsByType,

      pendingApproval

    ] = await Promise.all([

      Contract.countDocuments(),

      Contract.countDocuments({ status: 'active' }),

      Contract.countDocuments({

        status: 'active',

        endDate: {

          $gte: today,

          $lte: thirtyDaysFromNow

        }

      }),

      Contract.countDocuments({

        endDate: { $lt: today },

        status: { $ne: 'terminated' }

      }),

      Contract.aggregate([

        {

          $group: {

            _id: '$contractType',

            count: { $sum: 1 }

          }

        }

      ]),

      Contract.countDocuments({ approvalStatus: 'pending' })

    ]);

    

    res.json({

      success: true,

      data: {

        totalContracts,

        activeContracts,

        expiringContracts,

        expiredContracts,

        pendingApproval,

        contractsByType: contractsByType.reduce((acc, item) => {

          acc[item._id] = item.count;

          return acc;

        }, {})

      }

    });

  } catch (error) {

    console.error('Error fetching contract stats:', error);

    res.status(500).json({

      success: false,

      message: 'Failed to fetch contract statistics',

      error: error.message

    });

  }

};



/**

 * Update deliverable status

 * PUT /api/contracts/:id/deliverables/:deliverableIndex

 */

exports.updateDeliverable = async (req, res) => {

  try {

    // Get tenant connection from middleware

    const tenantConnection = req.tenant.connection;

    const contractSchema = require('../models/tenant/Contract');

    const Contract = getTenantModel(tenantConnection, 'Contract', contractSchema);

    

    const { id, deliverableIndex } = req.params;

    const { status, completedDate } = req.body;

    

    const contract = await Contract.findById(id);

    

    if (!contract) {

      return res.status(404).json({

        success: false,

        message: 'Contract not found'

      });

    }

    

    if (contract.contractType !== 'fixed-deliverable') {

      return res.status(400).json({

        success: false,

        message: 'This contract is not a fixed-deliverable contract'

      });

    }

    

    const index = parseInt(deliverableIndex);

    if (index < 0 || index >= contract.deliverables.length) {

      return res.status(400).json({

        success: false,

        message: 'Invalid deliverable index'

      });

    }

    

    if (status) contract.deliverables[index].status = status;

    if (completedDate) contract.deliverables[index].completedDate = completedDate;

    

    await contract.save();

    

    res.json({

      success: true,

      message: 'Deliverable updated successfully',

      data: contract

    });

  } catch (error) {

    console.error('Error updating deliverable:', error);

    res.status(500).json({

      success: false,

      message: 'Failed to update deliverable',

      error: error.message

    });

  }

};



/**

 * Update hours worked (for hourly contracts)

 * POST /api/contracts/:id/hours

 */

exports.updateHours = async (req, res) => {

  try {

    // Get tenant connection from middleware

    const tenantConnection = req.tenant.connection;

    const contractSchema = require('../models/tenant/Contract');

    const Contract = getTenantModel(tenantConnection, 'Contract', contractSchema);

    

    const { hours } = req.body;

    

    if (!hours || hours <= 0) {

      return res.status(400).json({

        success: false,

        message: 'Valid hours value is required'

      });

    }

    

    const contract = await Contract.findById(req.params.id);

    

    if (!contract) {

      return res.status(404).json({

        success: false,

        message: 'Contract not found'

      });

    }

    

    if (contract.contractType !== 'hourly-based') {

      return res.status(400).json({

        success: false,

        message: 'This contract is not an hourly-based contract'

      });

    }

    

    contract.actualHours = (contract.actualHours || 0) + hours;

    await contract.save();

    

    res.json({

      success: true,

      message: 'Hours updated successfully',

      data: contract

    });

  } catch (error) {

    console.error('Error updating hours:', error);

    res.status(500).json({

      success: false,

      message: 'Failed to update hours',

      error: error.message

    });

  }

};



module.exports = exports;

