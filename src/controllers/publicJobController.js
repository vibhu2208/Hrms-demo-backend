const { getTenantModel } = require('../utils/tenantModels');
const { getTenantConnection } = require('../config/database.config');
const { getS3FileUrl } = require('../middlewares/s3Upload');

// @desc    Get all active public job postings
// @route   GET /api/public/jobs?companyId=xxx
// @access  Public
exports.getPublicJobs = async (req, res) => {
  try {
    const { department, location, employmentType, companyId } = req.query;
    
    // Default to the tenant from seed script if no companyId provided
    const tenantId = companyId || '696b515db6c9fd5fd51aed1c';
    
    console.log('📋 Fetching public jobs for company:', tenantId);
    
    // Get tenant connection
    const tenantConnection = await getTenantConnection(tenantId);
    const JobPosting = getTenantModel(tenantConnection, 'JobPosting');
    
    if (!JobPosting) {
      console.error('❌ JobPosting model not found for tenant');
      return res.status(500).json({ 
        success: false, 
        message: 'JobPosting model not available' 
      });
    }
    
    // Build query for active jobs only
    let query = { status: 'active' };
    
    if (department) query.department = department;
    if (location) query.location = { $regex: location, $options: 'i' };
    if (employmentType) query.employmentType = employmentType;

    console.log('   Query:', JSON.stringify(query));
    
    const totalCount = await JobPosting.countDocuments({});
    console.log(`   Total jobs in DB: ${totalCount}`);

    const jobs = await JobPosting.find(query)
      .populate('department', 'name')
      .select('-postedBy -applications -__v')
      .sort({ postedDate: -1 });

    console.log(`   Found ${jobs.length} active jobs`);

    // Add cache-control headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).json({ 
      success: true, 
      count: jobs.length, 
      data: jobs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Get public jobs error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch job postings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get single public job posting
// @route   GET /api/public/jobs/:id?companyId=xxx
// @access  Public
exports.getPublicJob = async (req, res) => {
  try {
    const { companyId } = req.query;
    const tenantId = companyId || '696b515db6c9fd5fd51aed1c';
    
    // Get tenant connection
    const tenantConnection = await getTenantConnection(tenantId);
    const JobPosting = getTenantModel(tenantConnection, 'JobPosting');
    
    const job = await JobPosting.findOne({ 
      _id: req.params.id, 
      status: 'active' 
    })
      .populate('department', 'name')
      .select('-postedBy -__v');

    if (!job) {
      return res.status(404).json({ 
        success: false, 
        message: 'Job posting not found or no longer active' 
      });
    }

    res.status(200).json({ 
      success: true, 
      data: job 
    });
  } catch (error) {
    console.error('❌ Get public job error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch job posting' 
    });
  }
};

// @desc    Submit job application
// @route   POST /api/public/jobs/:id/apply?companyId=xxx
// @access  Public
exports.submitApplication = async (req, res) => {
  try {
    const jobId = req.params.id;
    const { companyId } = req.query;
    const tenantId = companyId || '696b515db6c9fd5fd51aed1c';
    
    // Get tenant connection
    const tenantConnection = await getTenantConnection(tenantId);
    const JobPosting = getTenantModel(tenantConnection, 'JobPosting');
    const Candidate = getTenantModel(tenantConnection, 'Candidate');

    // Verify models are available
    if (!JobPosting) {
      console.error('❌ JobPosting model not found for tenant:', tenantId);
      return res.status(500).json({ 
        success: false, 
        message: 'JobPosting model not available' 
      });
    }

    if (!Candidate) {
      console.error('❌ Candidate model not found for tenant:', tenantId);
      return res.status(500).json({ 
        success: false, 
        message: 'Candidate model not available' 
      });
    }

    // Verify job exists and is active
    console.log('Looking for job with ID:', jobId);
    const job = await JobPosting.findById(jobId);
    console.log('Job found:', job ? { id: job._id, title: job.title, status: job.status } : 'No job found');
    
    if (!job) {
      return res.status(404).json({ 
        success: false, 
        message: 'Job posting not found' 
      });
    }
    
    if (job.status !== 'active') {
      return res.status(400).json({ 
        success: false, 
        message: `Job posting is ${job.status}, not accepting applications` 
      });
    }

    // Helper function to normalize phone
    const normalizePhone = (phone) => {
      if (!phone) return null;
      return phone.replace(/\D/g, '');
    };

    // Check for global duplicate (any application by this email/phone)
    const normalizedEmail = req.body.email?.toLowerCase().trim();
    const normalizedPhone = normalizePhone(req.body.phone);
    
    const globalDuplicateQuery = {
      $or: []
    };

    if (normalizedEmail) {
      globalDuplicateQuery.$or.push({ email: normalizedEmail });
    }

    if (normalizedPhone) {
      globalDuplicateQuery.$or.push({ phone: normalizedPhone });
      globalDuplicateQuery.$or.push({ alternatePhone: normalizedPhone });
    }

    const globalDuplicate = globalDuplicateQuery.$or.length > 0 
      ? await Candidate.findOne(globalDuplicateQuery)
          .select('candidateCode firstName lastName email phone appliedFor stage status timeline')
          .populate('appliedFor', 'title')
          .sort({ createdAt: -1 })
      : null;

    // Check if candidate already applied for this specific job
    const existingApplication = await Candidate.findOne({
      email: normalizedEmail,
      appliedFor: jobId
    });

    if (existingApplication) {
      return res.status(400).json({
        success: false,
        message: 'You have already applied for this position'
      });
    }

    // If global duplicate found, include info in response (non-blocking)
    if (globalDuplicate) {
      // Still allow application, but include duplicate info
      console.log(`Duplicate candidate found: ${globalDuplicate.email} - Previous applications: ${globalDuplicate.timeline?.length || 0}`);
    }

    // Handle resume file if uploaded
    let resumeData = {};
    if (req.file) {
      // Use S3 URL if available, otherwise fallback to local storage
      const resumeUrl = getS3FileUrl(req.file) || null;
      
      resumeData = {
        url: resumeUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        uploadedAt: new Date(),
        // Add S3 information if available
        ...(req.file.s3Key && {
          s3Key: req.file.s3Key,
          s3Bucket: req.file.s3Bucket,
          isS3File: true
        })
      };
      
      console.log('📄 Resume data:', {
        hasS3Key: !!req.file.s3Key,
        url: resumeUrl,
        originalName: req.file.originalname
      });
    }

    // Check if we have the required fields
    if (!req.body.firstName || !req.body.lastName || !req.body.email || !req.body.phone) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: firstName, lastName, email, phone'
      });
    }

    // Parse JSON fields from FormData
    const parseJsonField = (field) => {
      try {
        if (!field || field === 'undefined' || field === 'null' || field === '[]') return [];
        
        // Handle string representation of arrays
        if (typeof field === 'string') {
          // Remove extra quotes if the string is double-quoted
          const cleanField = field.replace(/^"(.*)"$/, '$1');
          const parsed = JSON.parse(cleanField);
          
          // Special handling for trainingCertificates - convert date strings to Date objects
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].completionDate) {
            return parsed.map(item => ({
              ...item,
              completionDate: item.completionDate ? new Date(item.completionDate) : undefined,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined
            }));
          }
          
          // Special handling for professionalExperience - convert date strings to Date objects
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].company) {
            return parsed.map(item => ({
              ...item,
              startDate: item.startDate ? new Date(item.startDate) : undefined,
              endDate: item.endDate ? new Date(item.endDate) : undefined,
              ctc: item.ctc ? parseFloat(item.ctc) : undefined
            }));
          }
          
          return parsed;
        }
        
        // Handle if it's already an object/array
        if (typeof field === 'object') {
          return field;
        }
        
        return [];
      } catch (error) {
        console.error('JSON parse error for field:', field, error);
        return [];
      }
    };

    console.log('Processing application for job:', jobId);
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Request body values sample:', {
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
      phone: req.body.phone,
      preferredLocation: req.body.preferredLocation,
      skills: req.body.skills
    });
    console.log('Has file:', !!req.file);

    // Parse experience object from FormData
    let experienceData = { years: 0, months: 0 };
    if (req.body.experience) {
      // If experience is sent as a JSON string or object
      try {
        if (typeof req.body.experience === 'string') {
          experienceData = JSON.parse(req.body.experience);
        } else if (typeof req.body.experience === 'object') {
          experienceData = req.body.experience;
        }
      } catch (error) {
        console.error('Error parsing experience:', error);
      }
    } else {
      // Try to get experience from individual fields
      experienceData = {
        years: parseInt(req.body['experience[years]']) || 0,
        months: parseInt(req.body['experience[months]']) || 0
      };
    }

    // Ensure experience years and months are numbers
    experienceData.years = parseInt(experienceData.years) || 0;
    experienceData.months = parseInt(experienceData.months) || 0;

    // Create candidate application with all required fields
    const candidateData = {
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email?.toLowerCase(),
      phone: req.body.phone,
      alternatePhone: req.body.alternatePhone || '',
      // Additional personal information
      dateOfBirth: req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : undefined,
      gender: req.body.gender || '',
      bloodGroup: req.body.bloodGroup || '',
      maritalStatus: req.body.maritalStatus || '',
      // Address information
      address: parseJsonField(req.body.address),
      currentLocation: req.body.currentLocation || '',
      // Emergency contact
      emergencyContact: parseJsonField(req.body.emergencyContact),
      // Employment preference
      employmentType: req.body.employmentType || 'full-time',
      // Job application specific
      appliedFor: jobId,
      source: req.body.source || 'job-portal',
      stage: 'applied',
      status: 'active',
      resume: resumeData,
      // Parse JSON fields safely
      preferredLocation: parseJsonField(req.body.preferredLocation),
      skills: parseJsonField(req.body.skills),
      education: parseJsonField(req.body.education),
      professionalExperience: parseJsonField(req.body.professionalExperience),
      trainingCertificates: parseJsonField(req.body.trainingCertificates),
      // Handle experience object
      experience: experienceData,
      // Optional fields
      currentCompany: req.body.currentCompany || '',
      currentDesignation: req.body.currentDesignation || '',
      currentCTC: req.body.currentCTC ? parseFloat(req.body.currentCTC) : undefined,
      expectedCTC: req.body.expectedCTC ? parseFloat(req.body.expectedCTC) : undefined,
      noticePeriod: req.body.noticePeriod ? parseInt(req.body.noticePeriod) : undefined,
      timeline: [{
        action: 'Application Submitted',
        description: `Applied for ${job.title}`,
        timestamp: new Date()
      }]
    };

    console.log('Candidate data prepared:', {
      firstName: candidateData.firstName,
      lastName: candidateData.lastName,
      email: candidateData.email,
      appliedFor: candidateData.appliedFor,
      experience: candidateData.experience,
      professionalExperience: candidateData.professionalExperience?.length || 0,
      education: candidateData.education?.length || 0,
      skills: candidateData.skills?.length || 0
    });

    // Validate required fields before creating candidate
    const validationErrors = [];
    if (!candidateData.firstName?.trim()) validationErrors.push('First name is required');
    if (!candidateData.lastName?.trim()) validationErrors.push('Last name is required');
    if (!candidateData.email?.trim()) validationErrors.push('Email is required');
    if (!candidateData.phone?.trim()) validationErrors.push('Phone is required');

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Generate unique candidate code (handle race conditions)
    let candidateCode;
    let attempts = 0;
    const maxAttempts = 20;
    let candidate;
    
    // For debugging, try a simple timestamp-based code first
    candidateCode = `CAN${Date.now().toString().slice(-8)}`;
    candidateData.candidateCode = candidateCode;
    
    console.log(`🔍 Using timestamp-based candidate code: ${candidateCode}`);
    
    try {
      console.log(`🔍 Attempting to create candidate with code: ${candidateCode}`);
      console.log(`🔍 Candidate data keys:`, Object.keys(candidateData));
      console.log(`🔍 Experience data:`, candidateData.experience);
      
      candidate = await Candidate.create(candidateData);
      console.log(`✅ Successfully created candidate with ID: ${candidate._id}`);
    } catch (createError) {
      console.error(`❌ Candidate creation error:`, createError);
      console.error(`❌ Error name:`, createError.name);
      console.error(`❌ Error message:`, createError.message);
      if (createError.errors) {
        console.error(`❌ Validation errors:`, Object.values(createError.errors).map(e => ({
          field: e.path,
          message: e.message,
          value: e.value
        })));
      }
      throw createError;
    }

    // Increment application count on job posting
    await JobPosting.findByIdAndUpdate(jobId, {
      $inc: { applications: 1 }
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully! We will review your application and get back to you soon.',
      isDuplicate: candidate.isDuplicate || false,
      duplicateInfo: globalDuplicate ? {
        previousApplications: globalDuplicate.timeline?.length || 0,
        lastApplication: globalDuplicate.appliedFor?.title,
        candidateCode: globalDuplicate.candidateCode
      } : null,
      data: {
        candidateCode: candidate.candidateCode,
        appliedFor: job.title,
        email: candidate.email
      }
    });
  } catch (error) {
    console.error('Submit application error:', error);
    console.error('Request body:', req.body);
    console.error('Request file:', req.file);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      console.error('❌ Validation errors:', messages);
      console.error('❌ Error details:', error.errors);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: messages
      });
    }

    // Handle cast errors (invalid ObjectId)
    if (error.name === 'CastError') {
      console.error('Cast error:', error.message);
      return res.status(400).json({
        success: false,
        message: 'Invalid data format'
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Failed to submit application. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get job statistics for public display
// @route   GET /api/public/jobs/stats?companyId=xxx
// @access  Public
exports.getJobStats = async (req, res) => {
  try {
    const { companyId } = req.query;
    
    // Default to the tenant from seed script if no companyId provided
    const tenantId = companyId || '696b515db6c9fd5fd51aed1c';
    
    // Get tenant connection
    const tenantConnection = await getTenantConnection(tenantId);
    const JobPosting = getTenantModel(tenantConnection, 'JobPosting');
    
    if (!JobPosting) {
      return res.status(500).json({ 
        success: false, 
        message: 'JobPosting model not available' 
      });
    }
    
    const totalJobs = await JobPosting.countDocuments({ status: 'active' });
    
    const departmentStats = await JobPosting.aggregate([
      { $match: { status: 'active' } },
      { 
        $group: { 
          _id: '$department', 
          count: { $sum: 1 } 
        } 
      },
      {
        $lookup: {
          from: 'departments',
          localField: '_id',
          foreignField: '_id',
          as: 'departmentInfo'
        }
      },
      {
        $project: {
          department: { $arrayElemAt: ['$departmentInfo.name', 0] },
          count: 1
        }
      }
    ]);

    const locationStats = await JobPosting.aggregate([
      { $match: { status: 'active' } },
      { 
        $group: { 
          _id: '$location', 
          count: { $sum: 1 } 
        } 
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalJobs,
        byDepartment: departmentStats,
        byLocation: locationStats
      }
    });
  } catch (error) {
    console.error('❌ Get job stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch job statistics' 
    });
  }
};

module.exports = exports;
