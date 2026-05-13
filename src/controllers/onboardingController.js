const { getTenantModel } = require('../utils/tenantModels');
const User = require('../models/User'); // User model stays global
const OfferTemplate = require('../models/OfferTemplate'); // Global model
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const employeeCreationService = require('../services/employeeCreationService');

// Configure email transporter using existing email config
const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    console.warn('Email configuration missing. Using SMTP fallback.');
    // Fallback to SMTP configuration if Gmail not configured
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD
    }
  });
};

const { generatePassword, generateEmployeeId } = require('../utils/passwordGenerator');
const { sendOnboardingEmail, sendHRNotification, sendDocumentRequestEmail, sendITNotification, sendFacilitiesNotification, sendOfferExtendedEmail, sendOfferLetterWithDocumentLink, sendOfferLetterWithTemplate, sendJoiningDateConfirmationEmail, sendAgreementLetterWithTemplate } = require('../services/emailService');

/**
 * Helper function to update candidate's applicationHistory when onboarding is created/updated
 */
const updateCandidateApplicationHistory = async (candidate, onboarding, Candidate) => {
  try {
    if (!candidate || !onboarding) {
      console.warn('⚠️ Cannot update applicationHistory: missing candidate or onboarding');
      return;
    }

    // Reload candidate to ensure we have the latest data
    const updatedCandidate = await Candidate.findById(candidate._id);
    if (!updatedCandidate) {
      console.warn('⚠️ Candidate not found for applicationHistory update');
      return;
    }

    // Initialize applicationHistory if it doesn't exist
    updatedCandidate.applicationHistory = updatedCandidate.applicationHistory || [];
    
    // Find the application entry for this job
    const jobId = onboarding.jobId || candidate.appliedFor?._id || candidate.appliedFor;
    const applicationEntry = updatedCandidate.applicationHistory.find(
      entry => entry.jobId && entry.jobId.toString() === jobId?.toString()
    );

    if (applicationEntry) {
      // Update existing entry
      applicationEntry.stage = 'sent-to-onboarding';
      applicationEntry.status = 'active';
      applicationEntry.outcome = 'ongoing'; // Fixed: 'onboarding' is not a valid enum value
      applicationEntry.onboardingRecord = onboarding._id;
    } else {
      // Add new entry
      updatedCandidate.applicationHistory.push({
        jobId: jobId,
        jobTitle: onboarding.position || candidate.appliedFor?.title || 'Position',
        appliedDate: candidate.createdAt || new Date(),
        stage: 'sent-to-onboarding',
        status: 'active',
        outcome: 'ongoing', // Fixed: 'onboarding' is not a valid enum value
        onboardingRecord: onboarding._id,
        interviews: []
      });
    }

    // Also update the stage
    if (updatedCandidate.stage !== 'sent-to-onboarding') {
      updatedCandidate.stage = 'sent-to-onboarding';
    }

    await updatedCandidate.save();
  } catch (error) {
    console.error('⚠️ Error updating applicationHistory:', error.message);
    console.error('Error stack:', error.stack);
    // Don't throw - this is a non-critical update
  }
};

/**
 * Send candidate to onboarding - Phase 2 Implementation
 * @route POST /api/applications/:id/send-to-onboarding
 * @access Private (HR/Admin only)
 */
exports.sendToOnboarding = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const { id: applicationId } = req.params;
    const { notes } = req.body;
    const hrUserId = req.user.id;

    // Find and validate the candidate application
    const candidate = await Candidate.findById(applicationId)
      .populate('appliedFor');

    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Candidate application not found'
      });
    }

    console.log(`📋 Processing sendToOnboarding for: ${candidate.firstName} ${candidate.lastName}`);
    console.log(`   Stage: ${candidate.stage}, AppliedFor: ${candidate.appliedFor?._id}, Department: ${candidate.appliedFor?.department}`);

    // Validate candidate stage allows transition to onboarding
    const allowedStages = ['offer-accepted', 'interview-completed', 'offer-extended', 'shortlisted'];
    if (!allowedStages.includes(candidate.stage)) {
      return res.status(400).json({
        success: false,
        message: `Cannot send to onboarding. Current stage: ${candidate.stage}. Required: ${allowedStages.join(' or ')}`
      });
    }

    // Check if already sent to onboarding - allow re-initialization if not completed
    const existingOnboarding = await Onboarding.findOne({ candidateEmail: candidate.email });

    if (existingOnboarding && existingOnboarding.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Candidate has already completed onboarding'
      });
    }

    // Validate required data
    if (!candidate.appliedFor) {
      return res.status(400).json({
        success: false,
        message: 'Job posting information is missing'
      });
    }

    if (!candidate.appliedFor.department) {
      return res.status(400).json({
        success: false,
        message: 'Department information is missing from job posting'
      });
    }

    // If existing onboarding exists but not completed, update it
    let onboarding;
    if (existingOnboarding) {
      console.log(`♻️ Updating existing onboarding record for ${candidate.email}`);
      existingOnboarding.applicationId = candidate._id;
      existingOnboarding.jobId = candidate.appliedFor._id;
      existingOnboarding.candidateName = `${candidate.firstName} ${candidate.lastName}`;
      existingOnboarding.candidatePhone = candidate.phone;
      existingOnboarding.position = candidate.appliedFor.title;
      existingOnboarding.department = candidate.appliedFor.department; // This is already an ObjectId
      existingOnboarding.status = 'preboarding';
      existingOnboarding.createdBy = hrUserId;
      existingOnboarding.assignedHR = hrUserId;
      
      if (!existingOnboarding.auditTrail) existingOnboarding.auditTrail = [];
      existingOnboarding.auditTrail.push({
        action: 'reinitialized',
        description: 'Onboarding record reinitialized',
        performedBy: hrUserId,
        previousStatus: existingOnboarding.status,
        newStatus: 'preboarding',
        metadata: { notes },
        timestamp: new Date()
      });
      
      await existingOnboarding.save();
      onboarding = existingOnboarding;
      
      // Update candidate's applicationHistory
      await updateCandidateApplicationHistory(candidate, onboarding, Candidate);
      
      // Log HR activity

      const { logSendToOnboarding } = require('../services/hrActivityLogService');
      await logSendToOnboarding(req.tenant.connection, candidate, onboarding, req);
    } else {
      // Create new onboarding record
      const onboardingData = {
        applicationId: candidate._id,
        jobId: candidate.appliedFor._id,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        candidateEmail: candidate.email,
        candidatePhone: candidate.phone,
        position: candidate.appliedFor.title,
        department: candidate.appliedFor.department, // This is already an ObjectId, not ._id
        status: 'preboarding',
        createdBy: hrUserId,
        assignedHR: hrUserId,
        
        // Initialize required documents checklist
        requiredDocuments: [
          { type: 'aadhar', isRequired: true },
          { type: 'pan', isRequired: true },
          { type: 'bank_details', isRequired: true },
          { type: 'address_proof', isRequired: true },
          { type: 'education_certificates', isRequired: true },
          { type: 'photo', isRequired: true },
          { type: 'payslip', isRequired: true }
        ],

        // Add initial audit trail entry
        auditTrail: [{
          action: 'sent_to_onboarding',
          description: 'Candidate sent to onboarding process',
          performedBy: hrUserId,
          previousStatus: candidate.stage,
          newStatus: 'preboarding',
          metadata: { notes },
          timestamp: new Date()
        }],

        // Set SLA expectations (default 7 days)
        sla: {
          expectedCompletionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      };

      onboarding = await Onboarding.create(onboardingData);
      
      // Update candidate's applicationHistory
      await updateCandidateApplicationHistory(candidate, onboarding, Candidate);
      
      // Log HR activity

      const { logSendToOnboarding } = require('../services/hrActivityLogService');
      await logSendToOnboarding(req.tenant.connection, candidate, onboarding, req);
    }

    // Auto-generate document upload token
    const CandidateDocumentUploadToken = getTenantModel(req.tenant.connection, 'CandidateDocumentUploadToken');
    let uploadUrl = null;
    
    try {
      const token = require('crypto').randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days validity

      const uploadToken = await CandidateDocumentUploadToken.create({
        onboardingId: onboarding._id,
        candidateId: onboarding.onboardingId,
        candidateName: onboarding.candidateName,
        candidateEmail: onboarding.candidateEmail,
        position: onboarding.position,
        token,
        expiresAt,
        generatedBy: hrUserId
      });

      const tenantId = req.tenant.companyId || req.tenant.clientId;
      // Hard-coded public upload documents base URL as requested
      uploadUrl = `http://3.108.172.119/public/upload-documents/${token}?tenantId=${tenantId}`;
    } catch (tokenError) {
      console.error('Error generating upload token:', tokenError);
    }

    // Update candidate record
    const updatedCandidate = await Candidate.findByIdAndUpdate(applicationId, {
      stage: 'sent-to-onboarding',
      onboardingRecord: onboarding._id,
      sentToOnboardingAt: new Date(),
      sentToOnboardingBy: hrUserId,
      $push: {
        timeline: {
          action: 'sent_to_onboarding',
          description: 'Candidate sent to onboarding process',
          performedBy: hrUserId,
          metadata: { onboardingId: onboarding._id, notes }
        }
      }
    }, { new: true });

    // Send offer letter with document upload link
    if (uploadUrl) {
      try {
        await sendOfferLetterWithDocumentLink({
          candidateName: onboarding.candidateName,
          candidateEmail: onboarding.candidateEmail,
          position: onboarding.position,
          joiningDate: onboarding.joiningDate,
          uploadUrl,
          companyName: req.tenant?.companyName || 'SPC MANAGMENT'
        });
        console.log(`📧 Offer letter with document link sent to ${onboarding.candidateEmail}`);
      } catch (emailError) {
        console.error('Error sending offer letter email:', emailError);
      }
    }

    // Populate the created onboarding record for response
    const populatedOnboarding = await Onboarding.findById(onboarding._id)
      .populate('applicationId', 'firstName lastName email candidateCode')
      .populate('jobId', 'title')
      .populate('department', 'name')
      .populate('createdBy', 'firstName lastName email');

    res.status(201).json({
      success: true,
      message: 'Candidate successfully sent to onboarding',
      data: {
        onboarding: populatedOnboarding,
        candidate: {
          id: candidate._id,
          name: `${candidate.firstName} ${candidate.lastName}`,
          email: candidate.email,
          stage: 'sent-to-onboarding'
        }
      }
    });

  } catch (error) {
    console.error('Error sending candidate to onboarding:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send candidate to onboarding',
      error: error.message
    });
  }
};

exports.getOnboardingList = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Get tenant-specific models
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    
    const { status, department, assignedHR, search } = req.query;
    let query = {};

    // Filter by status (exclude completed by default unless specifically requested)
    if (status) {
      query.status = status;
    } else {
      query.status = { $ne: 'completed' }; // Show active onboarding records
    }

    // Filter by department
    if (department) query.department = department;

    // Filter by assigned HR
    if (assignedHR) query.assignedHR = assignedHR;

    // Search functionality
    if (search) {
      query.$or = [
        { candidateName: { $regex: search, $options: 'i' } },
        { candidateEmail: { $regex: search, $options: 'i' } },
        { position: { $regex: search, $options: 'i' } },
        { onboardingId: { $regex: search, $options: 'i' } }
      ];
    }

    console.log('📋 Fetching onboarding list with query:', JSON.stringify(query));
    
    // First check total count without filters
    const totalCount = await Onboarding.countDocuments({});
    console.log(`   Total onboarding records in DB: ${totalCount}`);
    
    const onboardingList = await Onboarding.find(query)
      .populate('applicationId', 'firstName lastName email candidateCode')
      .populate('jobId', 'title')
      .populate('department', 'name')
      .populate('createdBy', 'firstName lastName email')
      .populate('assignedHR', 'firstName lastName email')
      .populate('tasks.assignedTo', 'firstName lastName')
      .sort({ createdAt: -1 });
    
    console.log(`   Found ${onboardingList.length} records matching query`);
    if (onboardingList.length > 0) {
      console.log(`   Sample record: ${onboardingList[0].candidateName} - Status: ${onboardingList[0].status}`);
    }

    // Calculate summary statistics
    const summary = {
      total: onboardingList.length,
      byStatus: {},
      overdue: 0
    };

    onboardingList.forEach(onboarding => {
      // Count by status
      summary.byStatus[onboarding.status] = (summary.byStatus[onboarding.status] || 0) + 1;
      
      // Count overdue
      if (onboarding.sla && onboarding.sla.expectedCompletionDate < new Date() && onboarding.status !== 'completed') {
        summary.overdue++;
      }
    });

    res.status(200).json({ 
      success: true, 
      count: onboardingList.length, 
      data: onboardingList,
      summary 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getOnboarding = async (req, res) => {
  try {
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const onboarding = await Onboarding.findById(req.params.id)
      .populate('employee')
      .populate('department')
      .populate('tasks.assignedTo');

    if (!onboarding) {
      return res.status(404).json({ success: false, message: 'Onboarding record not found' });
    }

    res.status(200).json({ success: true, data: onboarding });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createOnboarding = async (req, res) => {
  try {
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const { candidateName, candidateEmail, position, department } = req.body;

    const onboarding = await Onboarding.create({
      candidateName,
      candidateEmail,
      candidatePhone: req.body.candidatePhone,
      position,
      department,
      stages: ['interview1', 'hrDiscussion', 'documentation', 'success'],
      currentStage: 'interview1',
      status: 'in-progress'
    });

    res.status(201).json({ success: true, message: 'Onboarding process initiated', data: onboarding });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateOnboarding = async (req, res) => {
  try {
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const onboarding = await Onboarding.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!onboarding) {
      return res.status(404).json({ success: false, message: 'Onboarding record not found' });
    }
    res.status(200).json({ success: true, message: 'Onboarding updated successfully', data: onboarding });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.advanceStage = async (req, res) => {
  try {
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const onboarding = await Onboarding.findById(req.params.id);
    if (!onboarding) {
      return res.status(404).json({ success: false, message: 'Onboarding record not found' });
    }

    const currentIndex = onboarding.stages.indexOf(onboarding.currentStage);
    if (currentIndex < onboarding.stages.length - 1) {
      onboarding.currentStage = onboarding.stages[currentIndex + 1];
      
      // If reached success stage, mark as completed
      if (onboarding.currentStage === 'success') {
        onboarding.status = 'completed';
        onboarding.completedAt = Date.now();
      }
      
      await onboarding.save();
      res.status(200).json({ success: true, message: 'Stage advanced successfully', data: onboarding });
    } else {
      res.status(400).json({ success: false, message: 'Already at final stage' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.setJoiningDate = async (req, res) => {
  try {
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const { joiningDate } = req.body;
    const onboarding = await Onboarding.findById(req.params.id);

    if (!onboarding) {
      return res.status(404).json({ success: false, message: 'Onboarding record not found' });
    }

    onboarding.joiningDate = joiningDate;
    await onboarding.save();

    res.status(200).json({ success: true, message: 'Joining date set successfully', data: onboarding });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addTask = async (req, res) => {
  try {
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const { title, description, assignedTo, dueDate } = req.body;
    const onboarding = await Onboarding.findById(req.params.id);

    if (!onboarding) {
      return res.status(404).json({ success: false, message: 'Onboarding record not found' });
    }

    onboarding.tasks.push({
      title,
      description,
      assignedTo,
      dueDate,
      status: 'pending'
    });

    await onboarding.save();

    res.status(200).json({ success: true, message: 'Task added successfully', data: onboarding });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.completeTask = async (req, res) => {
  try {
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const { taskId } = req.params;
    const onboarding = await Onboarding.findById(req.params.id);

    if (!onboarding) {
      return res.status(404).json({ success: false, message: 'Onboarding record not found' });
    }

    const task = onboarding.tasks.id(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    task.status = 'completed';
    task.completedAt = Date.now();
    await onboarding.save();

    res.status(200).json({ success: true, message: 'Task completed successfully', data: onboarding });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOnboarding = async (req, res) => {
  try {
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const onboarding = await Onboarding.findByIdAndDelete(req.params.id);
    if (!onboarding) {
      return res.status(404).json({ success: false, message: 'Onboarding record not found' });
    }
    res.status(200).json({ success: true, message: 'Onboarding deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update onboarding status with state machine validation
 * @route PUT /api/onboarding/:id/status
 * @access Private (HR/Admin only)
 */
exports.updateOnboardingStatus = async (req, res) => {
  try {
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const { id } = req.params;
    const { status, notes } = req.body;
    const hrUserId = req.user.id;

    // Define allowed state transitions - Updated workflow: Admin approval first, then payslip verification, then offer, then background verification
    const allowedTransitions = {
      'preboarding': ['pending_approval', 'rejected'], // Can only request approval or reject
      'pending_approval': ['preboarding', 'approval_rejected', 'payslip_upload_requested'], // Admin can approve (moves to payslip request), reject, or send back
      'approval_rejected': ['pending_approval', 'rejected'], // HR can re-request or reject candidate
      'payslip_upload_requested': ['payslip_verification', 'rejected'], // After sending payslip request
      'payslip_verification': ['payslip_approved', 'payslip_rejected'], // HR can approve or reject payslip
      'payslip_approved': ['offer_sent', 'rejected'], // After payslip approval, can send offer or reject
      'payslip_rejected': ['payslip_upload_requested', 'rejected'], // Can re-request payslip or reject candidate
      'offer_sent': ['offer_accepted', 'rejected'], // Candidate can accept or reject offer
      'offer_accepted': ['background_verification', 'rejected'], // After offer accepted, start background verification
      'background_verification': ['background_verified', 'background_rejected', 'rejected'], // Background verification results
      'background_verified': ['docs_pending', 'ready_for_joining', 'rejected'], // After background verification, can request docs or skip
      'background_rejected': ['rejected'], // Background verification failed
      'docs_pending': ['docs_verified', 'ready_for_joining', 'rejected'], // Can skip docs verification
      'docs_verified': ['ready_for_joining', 'rejected'],
      'ready_for_joining': ['completed', 'rejected'],
      'completed': [], // Terminal state
      'rejected': [] // Terminal state
    };

    const onboarding = await Onboarding.findById(id);
    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }

    // Validate state transition
    if (!allowedTransitions[onboarding.status].includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition from ${onboarding.status} to ${status}`,
        allowedTransitions: allowedTransitions[onboarding.status]
      });
    }

    const previousStatus = onboarding.status;
    onboarding.status = status;

    // Add audit trail entry
    onboarding.auditTrail.push({
      action: 'status_updated',
      description: `Status changed from ${previousStatus} to ${status}`,
      performedBy: hrUserId,
      previousStatus,
      newStatus: status,
      metadata: { notes },
      timestamp: new Date()
    });

    await onboarding.save();

    // Auto-send document request email when status changes to docs_pending
    if (status === 'docs_pending' && previousStatus !== 'docs_pending') {
      try {
        console.log(`📧 Auto-sending document request email for ${onboarding.candidateName} as status changed to docs_pending`);
        
        // Generate upload token
        const CandidateDocumentUploadToken = getTenantModel(req.tenant.connection, 'CandidateDocumentUploadToken');
        let uploadToken = await CandidateDocumentUploadToken.findOne({
          onboardingId: onboarding._id,
          isActive: true,
          revokedAt: null
        });

        let uploadUrl;
        const tenantId = req.tenant.companyId || req.tenant.clientId;

        if (uploadToken) {
          // Reuse existing token
          uploadUrl = `http://3.108.172.119/public/upload-documents/${uploadToken.token}?tenantId=${tenantId}`;
          console.log(`✅ Reusing existing upload token for ${onboarding.candidateName}`);
        } else {
          // Generate new token
          const token = require('crypto').randomBytes(32).toString('hex');
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30); // 30 days validity

          uploadToken = await CandidateDocumentUploadToken.create({
            onboardingId: onboarding._id,
            candidateId: onboarding.onboardingId,
            candidateName: onboarding.candidateName,
            candidateEmail: onboarding.candidateEmail,
            position: onboarding.position,
            token,
            expiresAt,
            generatedBy: hrUserId
          });

          uploadUrl = `http://3.108.172.119/public/upload-documents/${token}?tenantId=${tenantId}`;
          console.log(`✅ Generated new upload token for ${onboarding.candidateName}`);
        }

        // Send document request email
        await sendDocumentRequestEmail({
          candidateName: onboarding.candidateName,
          candidateEmail: onboarding.candidateEmail,
          position: onboarding.position,
          uploadUrl,
          companyName: req.tenant?.companyName || 'SPC MANAGMENT'
        });

        // Add audit trail for automatic email
        onboarding.auditTrail.push({
          action: 'document_request_auto_sent',
          description: `Document upload link automatically sent to candidate via email (status changed to docs_pending)`,
          performedBy: hrUserId,
          metadata: { uploadUrl, tokenId: uploadToken._id, previousStatus },
          timestamp: new Date()
        });

        await onboarding.save();
        console.log(`📧 Auto document request email sent to ${onboarding.candidateEmail}`);

      } catch (emailError) {
        console.error('⚠️ Failed to send automatic document request email:', emailError);
        // Don't fail the status update, just log the error
      }
    }

    // Log HR activity
    try {
      const { logOnboardingStatusChanged } = require('../services/hrActivityLogService');
      await logOnboardingStatusChanged(req.tenant.connection, onboarding, previousStatus, status, req);
    } catch (logError) {
      console.error('⚠️ Failed to log HR activity for onboarding status change:', logError.message);
    }

    res.status(200).json({
      success: true,
      message: 'Onboarding status updated successfully',
      data: {
        onboardingId: onboarding.onboardingId,
        previousStatus,
        newStatus: status,
        updatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Error updating onboarding status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update onboarding status',
      error: error.message
    });
  }
};

/**
 * Send offer letter to candidate
 * @route POST /api/onboarding/:id/send-offer
 * @access Private (HR/Admin only)
 */
exports.sendOffer = async (req, res) => {
  try {
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    // Use global OfferTemplate model (not tenant-specific)
    const { id } = req.params;
    let emailWarning = null; // Track email sending issues
    const { 
      templateId, 
      clientName,
      location,
      employmentStartDate,
      contractEndDate,
      monthlySalary,
      projectName,
      additionalDetails = {}
    } = req.body;
    const hrUserId = req.user.id;

    // Validate required fields for offer
    if (!clientName || !location || !employmentStartDate || !contractEndDate || !monthlySalary || !projectName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required offer details. Please provide: client organization, work location, project name, employment start date, contract end date, and monthly salary.',
        requiredFields: ['clientName', 'location', 'projectName', 'employmentStartDate', 'contractEndDate', 'monthlySalary']
      });
    }

    const onboarding = await Onboarding.findById(id)
      .populate('applicationId')
      .populate('department');

    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }

    // Validate status - allow payslip_verification, preboarding, offer_sent, or any status to send offer
    if (!onboarding.status) {
      return res.status(400).json({
        success: false,
        message: 'Onboarding record has no status'
      });
    }

    // Check approval status - MANDATORY: Cannot send offer without admin approval
    // This ensures the approval workflow is not skippable
    if (onboarding.approvalStatus?.status !== 'approved') {
      // Check if approval is pending
      if (onboarding.approvalStatus?.status === 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Cannot send offer. Approval is pending from admin. Please wait for approval.',
          code: 'APPROVAL_PENDING'
        });
      }
      
      // Check if approval was rejected
      if (onboarding.approvalStatus?.status === 'rejected') {
        return res.status(400).json({
          success: false,
          message: 'Cannot send offer. Previous approval request was rejected. Please re-request approval.',
          code: 'APPROVAL_REJECTED',
          rejectionReason: onboarding.approvalStatus?.rejectionReason
        });
      }
      
      // No approval requested yet
      return res.status(400).json({
        success: false,
        message: 'Cannot send offer without admin approval. Please request approval first.',
        code: 'APPROVAL_REQUIRED'
      });
    }

    // Get offer template
    let template;
    
    // If templateId is 'default' or not provided, fetch any available template
    if (!templateId || templateId === 'default') {
      // Try to find a default template first
      template = await OfferTemplate.findOne({
        isDefault: true
      });
      
      // If no default template exists, find any template (regardless of status)
      if (!template) {
        template = await OfferTemplate.findOne({});
      }
      
      if (!template) {
        console.error('No offer templates found in database');
        return res.status(400).json({
          success: false,
          message: 'No offer template found. Please create an offer template first.'
        });
      }
    } else {
      // Validate that templateId is a valid ObjectId
      if (!templateId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid template ID format'
        });
      }
      
      template = await OfferTemplate.findById(templateId);
      if (!template) {
        return res.status(400).json({
          success: false,
          message: 'Offer template not found'
        });
      }
    }

    // Set offer expiry (24 hours from now)
    const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Parse monthly salary and calculate annual CTC
    const parsedMonthlySalary = parseFloat(monthlySalary);
    const annualCTC = parsedMonthlySalary * 12;

    // Use offer details from request or fallback to onboarding data
    const designation = additionalDetails?.designation || onboarding.position || 'Not Specified';
    const benefits = additionalDetails?.benefits || [];

    // Calculate salary breakdown (60% basic, 40% HRA by default)
    const basic = Math.round(parsedMonthlySalary * 0.6);
    const hra = Math.round(parsedMonthlySalary * 0.4);

    // Update onboarding with offer details
    onboarding.offer = {
      templateId: template._id,
      templateVersion: template.version,
      offeredDesignation: onboarding.position,
      offeredCTC: annualCTC,
      monthlySalary: parsedMonthlySalary,
      salary: {
        basic: basic,
        hra: hra,
        allowances: 0,
        total: parsedMonthlySalary
      },
      clientName: clientName,
      location: location,
      projectName: projectName,
      employmentStartDate: new Date(employmentStartDate),
      contractEndDate: new Date(contractEndDate),
      sentAt: new Date(),
      sentBy: hrUserId,
      expiryDate,
      remindersSent: [],
      additionalDetails: additionalDetails
    };

    onboarding.status = 'offer_sent';

    // Add audit trail
    onboarding.auditTrail.push({
      action: 'offer_sent',
      description: 'Offer letter sent to candidate',
      performedBy: hrUserId,
      previousStatus: 'preboarding',
      newStatus: 'offer_sent',
      metadata: { 
        templateId, 
        clientName,
        location,
        projectName,
        employmentStartDate,
        contractEndDate,
        monthlySalary: parsedMonthlySalary,
        additionalDetails 
      },
      timestamp: new Date()
    });

    await onboarding.save();

    // Get candidate details
    const candidate = await Candidate.findById(onboarding.applicationId);
    
    if (!candidate) {
      console.error('❌ Candidate not found for ID:', onboarding.applicationId);
      return res.status(400).json({
        success: false,
        message: 'Candidate not found'
      });
    }
    
    console.log('👤 Found candidate:', `${candidate.firstName} ${candidate.lastName}`);
    console.log('📧 Candidate email:', candidate.email);
    
    try {
      console.log('📧 Attempting to send offer email to candidate...');
      console.log('📧 Candidate details:', {
        name: `${candidate.firstName} ${candidate.lastName}`,
        email: candidate.email,
        position: onboarding.position,
        joiningDate: employmentStartDate
      });
      console.log('📧 Email configuration check - EMAIL_USER:', process.env.EMAIL_USER);
      
      // Prepare offer details for template
      const templateOfferDetails = {
        clientName: clientName,
        location: location,
        projectName: projectName,
        joiningDate: new Date(employmentStartDate).toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        }),
        contractStartDate: new Date(employmentStartDate).toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        }),
        contractEndDate: new Date(contractEndDate).toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        }),
        monthlySalary: monthlySalary,
        basic: basic,
        hra: hra,
        allowances: 0,
        benefits: additionalDetails.benefits || '',
        contractExtensionInfo: additionalDetails.contractExtensionInfo || '',
        hrName: additionalDetails.hrName || 'HR Team',
        hrDesignation: additionalDetails.hrDesignation || 'HR Manager',
        expiryDate: expiryDate.toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        }),
        currentDate: new Date().toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        }),
        ...additionalDetails
      };

      const emailResult = await sendOfferLetterWithTemplate({
        templateId: templateId,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        candidateEmail: candidate.email,
        position: onboarding.position,
        designation: onboarding.position,
        ctc: annualCTC,
        joiningDate: new Date(employmentStartDate),
        offerDetails: templateOfferDetails,
        companyName: process.env.COMPANY_NAME || 'SPC Management Services PVT Ltd.'
      });
      
    } catch (emailError) {
      console.error('❌ EMAIL SENDING FAILED:');
      console.error('⚠️ Error message:', emailError.message);
      console.error('⚠️ Full email error:', emailError);
      console.error('⚠️ Stack trace:', emailError.stack);
      
      // Don't fail the request if email fails, but log the error
      // Return warning in response for debugging
      emailWarning = emailError.message;
    }

    // Log HR activity
    try {

      const { logOfferSent } = require('../services/hrActivityLogService');
      await logOfferSent(req.tenant.connection, onboarding, req);
    } catch (logError) {
      console.error('⚠️ Failed to log HR activity for offer sent:', logError.message);
      // Don't fail the request if logging fails
    }

    res.status(200).json({
      success: true,
      message: emailWarning ? 'Offer processed but email may have failed' : 'Offer letter sent successfully',
      data: {
        onboardingId: onboarding.onboardingId,
        offerSentAt: onboarding.offer.sentAt,
        expiryDate: onboarding.offer.expiryDate,
        emailSent: !emailWarning, // Set to false if there was an email warning
        templateUsed: {
          templateId: onboarding.offer.templateId,
          templateName: template.name,
          emailSentAt: onboarding.offer.sentAt
        },
        offerDetails: {
          clientName: clientName,
          location: location,
          projectName: projectName,
          employmentStartDate: employmentStartDate,
          contractEndDate: contractEndDate,
          monthlySalary: monthlySalary
        },
        emailWarning: emailWarning // Include email warning for debugging
      }
    });

  } catch (error) {
    console.error('Error sending offer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send offer letter',
      error: error.message
    });
  }
};

/**
 * Accept offer (candidate action via secure link)
 * @route POST /api/onboarding/:id/accept-offer
 * @access Public (with secure token)
 */
exports.acceptOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { acceptanceNotes } = req.body;

    // Get tenant connection from the onboarding record
    const onboarding = await Onboarding.findById(id);
    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }

    // Get tenant connection - we need to find which tenant this onboarding belongs to
    const { getTenantByConnection } = require('../utils/tenantModels');
    let tenantConnection = null;
    
    // Try to find the tenant connection by checking common tenant databases
    // This is a workaround since we don't have tenant middleware on this public route
    try {
      const Company = require('../models/Company');
      const companies = await Company.find({});
      
      for (const company of companies) {
        try {
          const tenantDb = require('../utils/tenantModels').getTenantModel(company.connectionString, 'Onboarding');
          const testOnboarding = await tenantDb.findById(id);
          if (testOnboarding) {
            tenantConnection = company.connectionString;
            break;
          }
        } catch (err) {
          // Continue to next company
        }
      }
    } catch (err) {
      console.log('Could not determine tenant, using default behavior');
    }

    // Validate status
    if (onboarding.status !== 'offer_sent') {
      return res.status(400).json({
        success: false,
        message: `Cannot accept offer. Current status: ${onboarding.status}`
      });
    }

    // Check if offer has expired
    if (onboarding.offer.expiryDate < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Offer has expired'
      });
    }

    const previousStatus = onboarding.status;

    // Update offer acceptance and move to docs_pending
    onboarding.offer.acceptedAt = new Date();
    onboarding.status = 'docs_pending'; // Move directly to docs_pending to trigger document request

    // Initialize required documents checklist if not already done
    if (!onboarding.requiredDocuments || onboarding.requiredDocuments.length === 0) {
      onboarding.requiredDocuments = [
        { type: 'aadhar', isRequired: true },
        { type: 'pan', isRequired: true },
        { type: 'bank_details', isRequired: true },
        { type: 'address_proof', isRequired: true },
        { type: 'education_certificates', isRequired: true },
        { type: 'photo', isRequired: true }
      ];
    }

    // Add audit trail for offer acceptance
    onboarding.auditTrail.push({
      action: 'offer_accepted',
      description: 'Candidate accepted the offer',
      performedBy: null, // Candidate action
      previousStatus: previousStatus,
      newStatus: 'docs_pending',
      metadata: { acceptanceNotes },
      timestamp: new Date()
    });

    await onboarding.save();

    // Auto-send document request email since status is now docs_pending
    try {
      console.log(`📧 Auto-sending document request email for ${onboarding.candidateName} (offer accepted)`);
      
      // Generate upload token - use the same tenant connection as the onboarding
      let uploadToken;
      let uploadUrl;
      
      if (tenantConnection) {
        const CandidateDocumentUploadToken = getTenantModel(tenantConnection, 'CandidateDocumentUploadToken');
        uploadToken = await CandidateDocumentUploadToken.findOne({
          onboardingId: onboarding._id,
          isActive: true,
          revokedAt: null
        });

        const tenantId = tenantConnection.replace('mongodb://localhost:27017/', '').replace('hrms_', '');
        
        if (uploadToken) {
          // Reuse existing token
          uploadUrl = `http://3.108.172.119/public/upload-documents/${uploadToken.token}?tenantId=${tenantId}`;
          console.log(`✅ Reusing existing upload token for ${onboarding.candidateName}`);
        } else {
          // Generate new token
          const token = require('crypto').randomBytes(32).toString('hex');
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30); // 30 days validity

          uploadToken = await CandidateDocumentUploadToken.create({
            onboardingId: onboarding._id,
            candidateId: onboarding.onboardingId,
            candidateName: onboarding.candidateName,
            candidateEmail: onboarding.candidateEmail,
            position: onboarding.position,
            token,
            expiresAt,
            generatedBy: null // System generated since candidate accepted
          });

          uploadUrl = `http://3.108.172.119/public/upload-documents/${token}?tenantId=${tenantId}`;
          console.log(`✅ Generated new upload token for ${onboarding.candidateName}`);
        }
      } else {
        // Fallback: generate a simple URL without tenant-specific token
        const token = require('crypto').randomBytes(32).toString('hex');
        uploadUrl = `http://3.108.172.119/public/upload-documents/${token}?tenantId=default`;
        console.log(`⚠️ Using fallback upload URL for ${onboarding.candidateName}`);
      }

      // Send document request email
      await sendDocumentRequestEmail({
        candidateName: onboarding.candidateName,
        candidateEmail: onboarding.candidateEmail,
        position: onboarding.position,
        uploadUrl,
        companyName: 'SPC MANAGMENT' // Default company name for public route
      });

      // Add audit trail for automatic email
      onboarding.auditTrail.push({
        action: 'document_request_auto_sent',
        description: `Document upload link automatically sent to candidate via email (offer accepted)`,
        performedBy: null,
        metadata: { uploadUrl, tokenId: uploadToken?._id, previousStatus: 'offer_sent' },
        timestamp: new Date()
      });

      await onboarding.save();
      console.log(`📧 Auto document request email sent to ${onboarding.candidateEmail}`);

    } catch (emailError) {
      console.error('⚠️ Failed to send automatic document request email after offer acceptance:', emailError);
      // Don't fail the offer acceptance, just log the error
    }

    res.status(200).json({
      success: true,
      message: 'Offer accepted successfully. Document request email has been sent.',
      data: {
        onboardingId: onboarding.onboardingId,
        acceptedAt: onboarding.offer.acceptedAt,
        currentStatus: onboarding.status,
        nextStep: 'document_submission'
      }
    });

  } catch (error) {
    console.error('Error accepting offer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept offer',
      error: error.message
    });
  }
};

/**
 * Set joining date and notify teams
 * @route POST /api/onboarding/:id/set-joining-date
 * @access Private (HR/Admin only)
 */
exports.setJoiningDateAndNotify = async (req, res) => {
  try {
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const { id } = req.params;
    const { joiningDate, notifyTeams } = req.body;
    const hrUserId = req.user.id;

    const onboarding = await Onboarding.findById(id)
      .populate('department')
      .populate('applicationId');

    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }

    // Validate status - NOTE: Allow setting joining date even if docs not fully verified
    // Document verification should not block the employment process
    const allowedStatuses = ['docs_verified', 'docs_pending', 'offer_accepted'];
    if (!allowedStatuses.includes(onboarding.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot set joining date. Current status: ${onboarding.status}. Required: ${allowedStatuses.join(' or ')}`
      });
    }

    // Validate joining date
    const joinDate = new Date(joiningDate);
    if (isNaN(joinDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid joining date'
      });
    }

    // Update joining date
    onboarding.joiningDate = joinDate;
    onboarding.status = 'ready_for_joining';

    // Add audit trail
    onboarding.auditTrail.push({
      action: 'joining_date_set',
      description: `Joining date set to ${joinDate.toDateString()}`,
      performedBy: hrUserId,
      previousStatus: onboarding.status, // Use current status instead of hardcoded docs_verified
      newStatus: 'ready_for_joining',
      metadata: { joiningDate, notifyTeams },
      timestamp: new Date()
    });

    // Send notifications if requested
    if (notifyTeams) {
      // Update notification status
      onboarding.notifications.itNotified.sent = true;
      onboarding.notifications.itNotified.sentAt = new Date();
      onboarding.notifications.itNotified.sentBy = hrUserId;

      onboarding.notifications.facilitiesNotified.sent = true;
      onboarding.notifications.facilitiesNotified.sentAt = new Date();
      onboarding.notifications.facilitiesNotified.sentBy = hrUserId;

      // Send actual notifications
      try {
        console.log(`📧 Sending IT and Facilities notifications for ${onboarding.candidateName}`);
        
        // Send IT notification
        const itResult = await sendITNotification({
          employeeName: onboarding.candidateName,
          employeeEmail: onboarding.candidateEmail,
          position: onboarding.position,
          department: onboarding.department?.name || 'Not specified',
          joiningDate: joinDate,
          companyName: req.tenant?.companyName || 'SPC MANAGMENT'
        });
        
        if (itResult.success) {
        } else {
        }

        // Send Facilities notification
        const facilitiesResult = await sendFacilitiesNotification({
          employeeName: onboarding.candidateName,
          position: onboarding.position,
          department: onboarding.department?.name || 'Not specified',
          joiningDate: joinDate,
          companyName: req.tenant?.companyName || 'SPC MANAGMENT'
        });
        
        if (facilitiesResult.success) {
        } else {
        }

      } catch (notificationError) {
        console.error('⚠️ Failed to send team notifications:', notificationError);
        // Don't fail the joining date setting, just log the error
      }
    }

    // Always send joining date confirmation email to candidate
    try {
      console.log(`📧 Sending joining date confirmation email to ${onboarding.candidateEmail}`);
      
      await sendJoiningDateConfirmationEmail({
        candidateName: onboarding.candidateName,
        candidateEmail: onboarding.candidateEmail,
        position: onboarding.position,
        joiningDate: joinDate,
        companyName: req.tenant?.companyName || 'SPC MANAGMENT'
      });
      
      
      // Add audit trail for joining date email
      onboarding.auditTrail.push({
        action: 'joining_date_email_sent',
        description: `Joining date confirmation email sent to candidate`,
        performedBy: hrUserId,
        metadata: { joiningDate, candidateEmail: onboarding.candidateEmail },
        timestamp: new Date()
      });
      
    } catch (emailError) {
      console.error('⚠️ Failed to send joining date confirmation email:', emailError);
      // Don't fail the joining date setting, just log the error
    }

    await onboarding.save();

    res.status(200).json({
      success: true,
      message: 'Joining date set and teams notified successfully',
      data: {
        onboardingId: onboarding.onboardingId,
        joiningDate: onboarding.joiningDate,
        status: onboarding.status,
        notificationsSent: notifyTeams
      }
    });

  } catch (error) {
    console.error('Error setting joining date:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set joining date',
      error: error.message
    });
  }
};

/**
 * Upload document for onboarding
 * @route POST /api/onboarding/:id/documents
 * @access Private (HR/Admin only) or Public (with secure token)
 */
exports.uploadDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { documentType, documentName, documentUrl, uploadedBy = 'candidate' } = req.body;

    const onboarding = await Onboarding.findById(id);
    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }

    // Validate document type
    const validTypes = [
      'resume', 'offer_letter_signed', 'aadhar', 'pan', 'bank_details', 
      'passport', 'education_certificates', 'experience_letters', 
      'address_proof', 'photo', 'other'
    ];

    if (!validTypes.includes(documentType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type'
      });
    }

    // Check if document already exists
    const existingDocIndex = onboarding.documents.findIndex(doc => doc.type === documentType);
    
    const documentData = {
      type: documentType,
      name: documentName,
      originalName: documentName,
      url: documentUrl,
      uploadedAt: new Date(),
      uploadedBy,
      status: 'uploaded',
      verified: false
    };

    if (existingDocIndex >= 0) {
      // Replace existing document
      onboarding.documents[existingDocIndex] = documentData;
    } else {
      // Add new document
      onboarding.documents.push(documentData);
    }

    // Update required documents checklist
    const requiredDocIndex = onboarding.requiredDocuments.findIndex(doc => doc.type === documentType);
    if (requiredDocIndex >= 0) {
      onboarding.requiredDocuments[requiredDocIndex].submitted = true;
    }

    // Add audit trail
    onboarding.auditTrail.push({
      action: 'document_uploaded',
      description: `Document uploaded: ${documentType}`,
      performedBy: req.user?.id || null,
      metadata: { documentType, documentName, uploadedBy },
      timestamp: new Date()
    });

    await onboarding.save();

    res.status(200).json({
      success: true,
      message: 'Document uploaded successfully',
      data: {
        document: documentData,
        onboardingId: onboarding.onboardingId
      }
    });

  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload document',
      error: error.message
    });
  }
};

/**
 * Verify or reject document
 * @route PUT /api/onboarding/:id/documents/:docId/verify
 * @access Private (HR/Admin only)
 */
exports.verifyDocument = async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { action, notes } = req.body; // action: 'approve' or 'reject'
    const hrUserId = req.user.id;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be either "approve" or "reject"'
      });
    }

    // Get tenant-specific Onboarding model
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const onboarding = await Onboarding.findById(id);
    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }

    const document = onboarding.documents.id(docId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Update document verification status
    document.verified = action === 'approve';
    document.verifiedBy = hrUserId;
    document.verifiedAt = new Date();
    document.verificationNotes = notes;
    document.status = action === 'approve' ? 'verified' : 'rejected';
    
    if (action === 'reject') {
      document.rejectionReason = notes;
    }

    // Update required documents checklist
    const requiredDocIndex = onboarding.requiredDocuments.findIndex(doc => doc.type === document.type);
    if (requiredDocIndex >= 0) {
      onboarding.requiredDocuments[requiredDocIndex].verified = action === 'approve';
    }

    // Add audit trail
    onboarding.auditTrail.push({
      action: `document_${action}d`,
      description: `Document ${action}d: ${document.type}`,
      performedBy: hrUserId,
      metadata: { documentType: document.type, notes },
      timestamp: new Date()
    });

    // Check if all required documents are verified
    const allRequiredVerified = onboarding.requiredDocuments
      .filter(doc => doc.isRequired)
      .every(doc => doc.verified);

    if (allRequiredVerified && onboarding.status === 'docs_pending') {
      onboarding.status = 'docs_verified';
      onboarding.auditTrail.push({
        action: 'all_documents_verified',
        description: 'All required documents have been verified',
        performedBy: hrUserId,
        timestamp: new Date()
      });
    }

    await onboarding.save();

    // SYNC: Also update the CandidateDocument collection to keep both systems in sync
    try {
      const CandidateDocument = getTenantModel(req.tenant.connection, 'CandidateDocument');
      
      // Map onboarding document types to CandidateDocument types
      const documentTypeMapping = {
        'aadhar': 'aadhaar_card',
        'pan': 'pan_card',
        'education_certificates': 'educational_certificate',
        'experience_letters': 'experience_letter',
        'photo': 'photograph',
        'resume': 'resume',
        'bank_details': 'bank_details',
        'passport': 'passport',
        'address_proof': 'address_proof',
        'other': 'other'
      };
      
      const mappedDocType = documentTypeMapping[document.type] || document.type;
      
      // Try to find the candidate document by multiple criteria
      let candidateDoc = await CandidateDocument.findOne({
        onboardingId: onboarding._id,
        documentType: mappedDocType,
        isActive: true
      });

      // If not found by mapped type, try original type
      if (!candidateDoc) {
        candidateDoc = await CandidateDocument.findOne({
          onboardingId: onboarding._id,
          documentType: document.type,
          isActive: true
        });
      }

      // If still not found, try by document name
      if (!candidateDoc && document.name) {
        candidateDoc = await CandidateDocument.findOne({
          onboardingId: onboarding._id,
          documentName: document.name,
          isActive: true
        });
      }

      if (candidateDoc) {
        candidateDoc.verificationStatus = action === 'approve' ? 'verified' : 'unverified';
        candidateDoc.verifiedBy = hrUserId;
        candidateDoc.verifiedByName = `${req.user.firstName} ${req.user.lastName}`;
        candidateDoc.verifiedAt = new Date();
        candidateDoc.verificationRemarks = notes;
        
        if (action === 'reject') {
          candidateDoc.unverifiedBy = hrUserId;
          candidateDoc.unverifiedByName = `${req.user.firstName} ${req.user.lastName}`;
          candidateDoc.unverifiedAt = new Date();
          candidateDoc.unverificationReason = notes;
        }

        // Add to history
        candidateDoc.addToHistory(
          action === 'approve' ? 'verified' : 'unverified', 
          hrUserId, 
          `${req.user.firstName} ${req.user.lastName}`, 
          notes
        );

        await candidateDoc.save();
      } else {
      }
    } catch (syncError) {
      console.error('❌ Failed to sync document verification to CandidateDocument collection:', syncError);
      // Don't fail the main operation if sync fails
    }

    // Send notification email to candidate if document was rejected
    if (action === 'reject') {
      try {
        const { sendDocumentRejectionEmail } = require('../services/emailService');
        await sendDocumentRejectionEmail({
          candidateName: onboarding.candidateName,
          candidateEmail: onboarding.candidateEmail,
          documentName: document.name || document.type,
          rejectionReason: notes,
          uploadUrl: document.uploadUrl || `http://3.108.172.119/public/upload-documents/${onboarding.uploadToken}?tenantId=${req.tenant.companyId || req.tenant.clientId}`,
          companyName: process.env.COMPANY_NAME || 'SPC MANAGMENT'
        });
      } catch (emailError) {
        console.error('❌ Failed to send document rejection email:', emailError);
      }
    }

    res.status(200).json({
      success: true,
      message: `Document ${action}d successfully`,
      data: {
        document,
        allDocumentsVerified: allRequiredVerified,
        onboardingStatus: onboarding.status
      }
    });

  } catch (error) {
    console.error('Error verifying document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify document',
      error: error.message
    });
  }
};

/**
 * Get document verification status
 * @route GET /api/onboarding/:id/documents
 * @access Private (HR/Admin only) or Public (with secure token)
 */
exports.getDocuments = async (req, res) => {
  try {
    const { id } = req.params;

    const onboarding = await Onboarding.findById(id)
      .populate('documents.verifiedBy', 'firstName lastName email');

    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }

    // Calculate verification progress
    const totalRequired = onboarding.requiredDocuments.filter(doc => doc.isRequired).length;
    const submitted = onboarding.requiredDocuments.filter(doc => doc.submitted).length;
    const verified = onboarding.requiredDocuments.filter(doc => doc.verified).length;

    const progress = {
      totalRequired,
      submitted,
      verified,
      submissionProgress: totalRequired > 0 ? Math.round((submitted / totalRequired) * 100) : 0,
      verificationProgress: totalRequired > 0 ? Math.round((verified / totalRequired) * 100) : 0
    };

    res.status(200).json({
      success: true,
      data: {
        onboardingId: onboarding.onboardingId,
        candidateName: onboarding.candidateName,
        status: onboarding.status,
        documents: onboarding.documents,
        requiredDocuments: onboarding.requiredDocuments,
        progress
      }
    });

  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch documents',
      error: error.message
    });
  }
};

/**
 * Request document resubmission
 * @route POST /api/onboarding/:id/documents/:docId/request-resubmission
 * @access Private (HR/Admin only)
 */
exports.requestDocumentResubmission = async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { reason } = req.body;
    const hrUserId = req.user.id;

    const onboarding = await Onboarding.findById(id);
    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }

    const document = onboarding.documents.id(docId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Update document status
    document.status = 'rejected';
    document.rejectionReason = reason;
    document.verified = false;

    // Add audit trail
    onboarding.auditTrail.push({
      action: 'document_resubmission_requested',
      description: `Resubmission requested for: ${document.type}`,
      performedBy: hrUserId,
      metadata: { documentType: document.type, reason },
      timestamp: new Date()
    });

    await onboarding.save();

    // TODO: Send resubmission request email to candidate
    // await sendDocumentResubmissionEmail(onboarding, document, reason);

    res.status(200).json({
      success: true,
      message: 'Document resubmission requested successfully',
      data: {
        document,
        onboardingId: onboarding.onboardingId
      }
    });

  } catch (error) {
    console.error('Error requesting document resubmission:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to request document resubmission',
      error: error.message
    });
  }
};

/**
 * Complete onboarding process and create employee account
 * @route POST /api/onboarding/:id/complete
 * @access Private (HR/Admin only)
 * 
 * This function:
 * 1. Validates onboarding completion requirements
 * 2. Creates employee record from onboarding data
 * 3. Generates secure credentials
 * 4. Creates user account with temporary password
 * 5. Sends welcome email with credentials
 * 6. Updates candidate status to 'joined'
 * 7. Marks onboarding as completed
 */
exports.completeOnboardingProcess = async (req, res) => {
  try {
    const { id } = req.params;
    const { companyName } = req.body;
    const tenantConnection = req.tenant.connection;


    // Validate onboarding completion readiness
    const validation = await employeeCreationService.validateOnboardingCompletion(id, tenantConnection);

    
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Onboarding validation failed',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    // Use the employee creation service to complete onboarding

    const result = await employeeCreationService.completeOnboardingAndCreateEmployee(
      id,
      tenantConnection,
      {
        // Any additional employee data from request
        createdBy: req.user._id
      }
    );


    // Log HR activity
    const { logOnboardingCompleted } = require('../services/hrActivityLogService');
    await logOnboardingCompleted(tenantConnection, result.onboarding, result.employee, req);

    return res.status(200).json({
      success: true,
      message: 'Onboarding completed successfully. Employee and user accounts created.',
      data: {
        employeeCode: result.employeeCode,
        employeeId: result.employee._id,
        email: result.employee.email,
        name: `${result.employee.firstName} ${result.employee.lastName}`,
        joiningDate: result.employee.joiningDate,
        designation: result.employee.designation,
        userAccount: result.userAccount,
        tempPassword: result.tempPassword, // Only shown once for admin
        onboardingId: result.onboarding._id,
        completedAt: result.onboarding.completedAt
      }
    });
  } catch (error) {
    console.error('❌ Error completing onboarding:', error);
    console.error('Error stack:', error.stack);
    
    // Provide more detailed error messages
    let errorMessage = 'Failed to complete onboarding process';
    let statusCode = 500;
    
    if (error.message) {
      errorMessage = error.message;
    }
    
    // Handle specific error types
    if (error.name === 'ValidationError') {
      statusCode = 400;
      errorMessage = `Validation error: ${Object.values(error.errors).map(e => e.message).join(', ')}`;
    } else if (error.code === 11000) {
      statusCode = 409;
      errorMessage = 'Employee with this email or employee code already exists';
    } else if (error.message.includes('not found')) {
      statusCode = 404;
      errorMessage = error.message;
    } else if (error.message.includes('required') || error.message.includes('must be')) {
      statusCode = 400;
      errorMessage = error.message;
    }
    
    return res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Helper function to send onboarding document submission email
async function sendOnboardingDocumentEmail(candidate, onboarding) {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.warn('Email transporter not configured, skipping onboarding document email');
      return;
    }

    const documentSubmissionUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/candidate-documents`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER || process.env.SMTP_FROM || 'noreply@hrms.com',
      to: candidate.email,
      subject: 'Welcome to Onboarding - Submit Your Documents',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4F46E5; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Welcome to Onboarding!</h1>
          </div>
          
          <div style="padding: 30px; background-color: #F9FAFB;">
            <p style="font-size: 16px;">Dear ${candidate.firstName} ${candidate.lastName},</p>
            
            <p>Congratulations! You have been moved to the onboarding stage. We're excited to have you join our team!</p>
            
            <div style="background-color: #EEF2FF; border-left: 4px solid #4F46E5; padding: 20px; margin: 25px 0;">
              <h3 style="margin-top: 0; color: #4F46E5;">Your Candidate ID</h3>
              <p style="font-size: 24px; font-weight: bold; color: #1F2937; margin: 10px 0;">
                ${candidate.candidateCode}
              </p>
              <p style="font-size: 14px; color: #6B7280; margin: 0;">
                Please keep this ID safe. You'll need it to submit your documents.
              </p>
            </div>
            
            <h3 style="color: #1F2937;">Next Steps: Submit Your Documents</h3>
            
            <p>To complete your onboarding process, please submit the following documents:</p>
            
            <ul style="line-height: 1.8;">
              <li><strong>Aadhar Card</strong> (PDF or Image)</li>
              <li><strong>PAN Card</strong> (PDF or Image)</li>
              <li><strong>Bank Details</strong> (Account Number, IFSC Code, Bank Name)</li>
              <li><strong>Bank Proof</strong> (Cancelled Cheque or Bank Statement)</li>
            </ul>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${documentSubmissionUrl}" 
                 style="display: inline-block; background-color: #4F46E5; color: white; padding: 15px 40px; 
                        text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Submit Documents Now
              </a>
            </div>
            
            <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 25px 0;">
              <p style="margin: 0; color: #92400E;">
                <strong>⚠️ Important:</strong> You will need your Candidate ID (${candidate.candidateCode}) to access the document submission portal.
              </p>
            </div>
            
            <h3 style="color: #1F2937;">How to Submit:</h3>
            <ol style="line-height: 1.8;">
              <li>Click the "Submit Documents Now" button above</li>
              <li>Enter your Candidate ID: <strong>${candidate.candidateCode}</strong></li>
              <li>Upload all required documents</li>
              <li>Submit the form</li>
            </ol>
            
            <p style="margin-top: 30px;">Once you submit your documents, our HR team will review them and get back to you shortly.</p>
            
            <p>If you have any questions or need assistance, please don't hesitate to contact our HR department.</p>
            
            <p style="margin-top: 30px;">
              Best regards,<br>
              <strong>HR Team</strong>
            </p>
          </div>
          
          <div style="background-color: #E5E7EB; padding: 20px; text-align: center;">
            <p style="color: #6B7280; font-size: 12px; margin: 0;">
              This is an automated email. Please do not reply to this message.<br>
              If you need help, contact our HR department.
            </p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Onboarding document submission email sent to ${candidate.email}`);
  } catch (error) {
    console.error('Error sending onboarding document email:', error);
    throw error;
  }
}

/**
 * Request documents from candidate - generates/reuses upload token and emails link
 * @route POST /api/onboarding/:id/request-documents
 * @access Private (HR/Admin only)
 */
exports.requestDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const CandidateDocumentUploadToken = getTenantModel(req.tenant.connection, 'CandidateDocumentUploadToken');
    const { sendDocumentRequestEmail } = require('../services/emailService');

    const onboarding = await Onboarding.findById(id);
    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }

    // Check for existing active token
    let uploadToken = await CandidateDocumentUploadToken.findOne({
      onboardingId: onboarding._id,
      isActive: true,
      revokedAt: null
    });

    let uploadUrl;
    const tenantId = req.tenant.companyId || req.tenant.clientId;

      if (uploadToken) {
        // Reuse existing token
        uploadUrl = `http://3.108.172.119/public/upload-documents/${uploadToken.token}?tenantId=${tenantId}`;
        console.log(`✅ Reusing existing upload token for ${onboarding.candidateName}`);
      } else {
        // Generate new token
        const token = require('crypto').randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days validity

        uploadToken = await CandidateDocumentUploadToken.create({
          onboardingId: onboarding._id,
          candidateId: onboarding.onboardingId,
          candidateName: onboarding.candidateName,
          candidateEmail: onboarding.candidateEmail,
          position: onboarding.position,
          token,
          expiresAt,
          generatedBy: req.user._id
        });

        uploadUrl = `http://3.108.172.119/public/upload-documents/${token}?tenantId=${tenantId}`;
        console.log(`✅ Generated new upload token for ${onboarding.candidateName}`);
      }

    // Send email with upload link
    try {
      await sendDocumentRequestEmail({
        candidateName: onboarding.candidateName,
        candidateEmail: onboarding.candidateEmail,
        position: onboarding.position,
        uploadUrl,
        companyName: req.tenant?.companyName || 'SPC MANAGMENT'
      });

      // Add audit trail
      onboarding.auditTrail.push({
        action: 'document_request_sent',
        description: `Document upload link sent to candidate via email`,
        performedBy: req.user._id,
        metadata: { uploadUrl, tokenId: uploadToken._id },
        timestamp: new Date()
      });

      await onboarding.save();

      console.log(`📧 Document request email sent to ${onboarding.candidateEmail}`);

      res.status(200).json({
        success: true,
        message: 'Document request email sent successfully',
        data: {
          uploadUrl,
          sentTo: onboarding.candidateEmail,
          tokenId: uploadToken._id
        }
      });
    } catch (emailError) {
      console.error('Error sending document request email:', emailError);
      res.status(500).json({
        success: false,
        message: 'Failed to send document request email',
        error: emailError.message
      });
    }

  } catch (error) {
    console.error('Error requesting documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to request documents',
      error: error.message
    });
  }
};

/**
 * Request approval from admin before sending offer
 * @route POST /api/onboarding/:id/request-approval
 * @access Private (HR only)
 */
exports.requestOnboardingApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, offerDetails } = req.body;
    const hrUserId = req.user.id || req.user._id;
    const tenantConnection = req.tenant.connection;
    
    const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
    const Candidate = getTenantModel(tenantConnection, 'Candidate');
    const TenantUserSchema = require('../models/tenant/TenantUser');
    const TenantUser = tenantConnection.model('User', TenantUserSchema);
    const ApprovalInstanceSchema = require('../models/tenant/ApprovalInstance');
    const ApprovalInstance = tenantConnection.model('ApprovalInstance', ApprovalInstanceSchema);
    
    // Get onboarding record with full details
    const onboarding = await Onboarding.findById(id)
      .populate('applicationId')
      .populate('department', 'name')
      .populate('jobId', 'title')
      .populate('createdBy', 'firstName lastName email')
      .populate('assignedHR', 'firstName lastName email');

    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }

    // Validate status - can only request approval in preboarding or after rejection
    const allowedStatuses = ['preboarding', 'approval_rejected'];
    if (!allowedStatuses.includes(onboarding.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot request approval in current status: ${onboarding.status}. Approval can only be requested in preboarding or after rejection.`
      });
    }

    // Check if approval is already pending
    if (onboarding.approvalStatus?.status === 'pending') {
      return res.status(400).json({
        success: false,
        message: 'An approval request is already pending for this candidate'
      });
    }

    // Get HR user details
    const hrUser = await TenantUser.findById(hrUserId).select('firstName lastName email role');
    if (!hrUser) {
      return res.status(400).json({
        success: false,
        message: 'HR user not found'
      });
    }

    // Get candidate details
    const candidate = await Candidate.findById(onboarding.applicationId)
      .populate('appliedFor', 'title department');

    // Find company admin to be the approver
    const companyAdmin = await TenantUser.findOne({ 
      role: 'company_admin', 
      isActive: true 
    }).select('firstName lastName email');

    if (!companyAdmin) {
      return res.status(400).json({
        success: false,
        message: 'No company admin found to approve this request. Please contact system administrator.'
      });
    }

    // Create approval instance with comprehensive metadata
    const approvalInstance = await ApprovalInstance.create({
      requestType: 'onboarding_approval',
      requestId: onboarding._id,
      requestedBy: hrUserId,
      currentLevel: 1,
      totalLevels: 1,
      status: 'pending',
      approvalChain: [{
        level: 1,
        approverType: 'company_admin',
        approverId: companyAdmin._id,
        status: 'pending',
        sla: {
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          escalationDate: new Date(Date.now() + 36 * 60 * 60 * 1000),
          isEscalated: false
        }
      }],
      metadata: {
        priority: 'high',
        // Candidate details
        candidateName: onboarding.candidateName,
        candidateEmail: onboarding.candidateEmail,
        candidatePhone: onboarding.candidatePhone,
        candidateCode: candidate?.candidateCode || 'N/A',
        // Job details
        position: onboarding.position,
        department: onboarding.department?.name || 'N/A',
        jobTitle: onboarding.jobId?.title || onboarding.position,
        // HR details
        requestedByName: `${hrUser.firstName} ${hrUser.lastName}`,
        requestedByEmail: hrUser.email,
        requestedByRole: hrUser.role,
        // Offer details (if provided)
        offerDetails: offerDetails || {},
        // Additional notes
        notes: notes || '',
        // Onboarding ID for reference
        onboardingId: onboarding.onboardingId
      },
      slaStatus: {
        startDate: new Date(),
        expectedCompletionDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
      },
      history: [{
        action: 'CREATED',
        performedBy: hrUserId,
        timestamp: new Date(),
        details: { 
          notes: notes || 'Onboarding approval request created',
          candidateName: onboarding.candidateName,
          position: onboarding.position
        }
      }]
    });

    // Update onboarding record
    onboarding.status = 'pending_approval';
    onboarding.approvalStatus = {
      status: 'pending',
      approvalInstanceId: approvalInstance._id,
      requestedBy: hrUserId,
      requestedAt: new Date(),
      canReRequest: false
    };

    // Add audit trail
    onboarding.auditTrail.push({
      action: 'approval_requested',
      description: `Approval requested from admin by ${hrUser.firstName} ${hrUser.lastName}`,
      performedBy: hrUserId,
      previousStatus: onboarding.status === 'approval_rejected' ? 'approval_rejected' : 'preboarding',
      newStatus: 'pending_approval',
      metadata: { 
        approvalInstanceId: approvalInstance._id,
        approverEmail: companyAdmin.email,
        notes 
      },
      timestamp: new Date()
    });

    await onboarding.save();


    res.status(200).json({
      success: true,
      message: 'Approval request sent to admin successfully',
      data: {
        onboardingId: onboarding.onboardingId,
        candidateName: onboarding.candidateName,
        approvalInstanceId: approvalInstance._id,
        status: 'pending',
        approverEmail: companyAdmin.email,
        requestedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Error requesting onboarding approval:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to request approval',
      error: error.message
    });
  }
};

/**
 * Get approval status for an onboarding record
 * @route GET /api/onboarding/:id/approval-status
 * @access Private (HR/Admin)
 */
exports.getOnboardingApprovalStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantConnection = req.tenant.connection;
    
    const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
    const ApprovalInstanceSchema = require('../models/tenant/ApprovalInstance');
    const ApprovalInstance = tenantConnection.model('ApprovalInstance', ApprovalInstanceSchema);
    const TenantUserSchema = require('../models/tenant/TenantUser');
    const TenantUser = tenantConnection.model('User', TenantUserSchema);

    const onboarding = await Onboarding.findById(id);
    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }

    // Get approval instance if exists
    let approvalInstance = null;
    if (onboarding.approvalStatus?.approvalInstanceId) {
      approvalInstance = await ApprovalInstance.findById(onboarding.approvalStatus.approvalInstanceId)
        .populate('requestedBy', 'firstName lastName email')
        .populate('approvalChain.approverId', 'firstName lastName email');
    }

    // Get history of approval requests for this onboarding
    const approvalHistory = await ApprovalInstance.find({
      requestType: 'onboarding_approval',
      requestId: onboarding._id
    })
    .populate('requestedBy', 'firstName lastName email')
    .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        onboardingId: onboarding.onboardingId,
        candidateName: onboarding.candidateName,
        currentStatus: onboarding.status,
        approvalStatus: onboarding.approvalStatus || { status: 'not_requested' },
        currentApprovalInstance: approvalInstance,
        approvalHistory: approvalHistory,
        canRequestApproval: ['preboarding', 'approval_rejected'].includes(onboarding.status) && 
                           onboarding.approvalStatus?.status !== 'pending',
        canSendOffer: onboarding.approvalStatus?.status === 'approved'
      }
    });

  } catch (error) {
    console.error('Error getting approval status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get approval status',
      error: error.message
    });
  }
};

/**
 * Process onboarding approval (Admin action)
 * @route PUT /api/onboarding/:id/process-approval
 * @access Private (Admin only)
 */
exports.processOnboardingApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, comments } = req.body; // action: 'approve' or 'reject'
    const adminUserId = req.user.id || req.user._id;
    const tenantConnection = req.tenant.connection;
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be either "approve" or "reject"'
      });
    }

    const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
    const ApprovalInstanceSchema = require('../models/tenant/ApprovalInstance');
    const ApprovalInstance = tenantConnection.model('ApprovalInstance', ApprovalInstanceSchema);
    const TenantUserSchema = require('../models/tenant/TenantUser');
    const TenantUser = tenantConnection.model('User', TenantUserSchema);

    const onboarding = await Onboarding.findById(id);
    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }

    // Validate status
    if (onboarding.status !== 'pending_approval') {
      return res.status(400).json({
        success: false,
        message: `Cannot process approval. Current status: ${onboarding.status}`
      });
    }

    // Get admin user details
    const adminUser = await TenantUser.findById(adminUserId).select('firstName lastName email role');
    
    // Validate admin role
    if (!adminUser || adminUser.role !== 'company_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only company admin can approve or reject onboarding requests'
      });
    }

    // Get and update approval instance
    const approvalInstance = await ApprovalInstance.findById(onboarding.approvalStatus.approvalInstanceId);
    if (approvalInstance) {
      const currentApprover = approvalInstance.getCurrentApprover();
      if (currentApprover) {
        currentApprover.status = action === 'approve' ? 'approved' : 'rejected';
        currentApprover.actionDate = new Date();
        currentApprover.comments = comments;
      }
      approvalInstance.status = action === 'approve' ? 'approved' : 'rejected';
      approvalInstance.slaStatus.actualCompletionDate = new Date();
      approvalInstance.history.push({
        action: action.toUpperCase(),
        performedBy: adminUserId,
        timestamp: new Date(),
        details: { comments, level: 1 }
      });
      await approvalInstance.save();
    }

    // Update onboarding record
    const previousStatus = onboarding.status;
    
    if (action === 'approve') {
      onboarding.status = 'payslip_upload_requested'; // Move to payslip upload request after approval
      onboarding.approvalStatus.status = 'approved';
      onboarding.approvalStatus.approvedBy = adminUserId;
      onboarding.approvalStatus.approvedAt = new Date();
      onboarding.approvalStatus.comments = comments;
      onboarding.approvalStatus.canReRequest = false;
    } else {
      onboarding.status = 'approval_rejected';
      onboarding.approvalStatus.status = 'rejected';
      onboarding.approvalStatus.rejectedBy = adminUserId;
      onboarding.approvalStatus.rejectedAt = new Date();
      onboarding.approvalStatus.rejectionReason = comments;
      onboarding.approvalStatus.canReRequest = true; // Allow HR to re-request
    }

    // Add audit trail
    onboarding.auditTrail.push({
      action: action === 'approve' ? 'approval_granted' : 'approval_rejected',
      description: action === 'approve' 
        ? `Approval granted by ${adminUser.firstName} ${adminUser.lastName}` 
        : `Approval rejected by ${adminUser.firstName} ${adminUser.lastName}`,
      performedBy: adminUserId,
      previousStatus,
      newStatus: onboarding.status,
      metadata: { comments },
      timestamp: new Date()
    });

    await onboarding.save();


    res.status(200).json({
      success: true,
      message: action === 'approve' 
        ? 'Onboarding approved. HR can now request payslip verification.' 
        : 'Onboarding rejected. Candidate is on hold.',
      data: {
        onboardingId: onboarding.onboardingId,
        candidateName: onboarding.candidateName,
        status: onboarding.status,
        approvalStatus: onboarding.approvalStatus,
        action,
        processedBy: `${adminUser.firstName} ${adminUser.lastName}`,
        processedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Error processing onboarding approval:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process approval',
      error: error.message
    });
  }
};

/**
 * Request payslip upload from candidate
 * @route POST /api/onboarding/:id/request-payslip-upload
 * @access Private (HR only)
 */
exports.requestPayslipUpload = async (req, res) => {
  try {
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const CandidateDocumentUploadToken = getTenantModel(req.tenant.connection, 'CandidateDocumentUploadToken');
    const { id } = req.params;
    const { notes } = req.body;
    const hrUserId = req.user.id;

    const onboarding = await Onboarding.findById(id);
    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }

    // Validate status - allow from payslip_upload_requested or when admin has approved
    const validStatuses = ['payslip_upload_requested', 'pending_approval'];
    const isAdminApproved = onboarding.approvalStatus?.status === 'approved';
    
    if (!validStatuses.includes(onboarding.status) || !isAdminApproved) {
      return res.status(400).json({
        success: false,
        message: 'Cannot request payslip upload. Admin approval is required first.',
        currentStatus: onboarding.status,
        approvalStatus: onboarding.approvalStatus?.status
      });
    }

    // Generate upload token for payslip
    const token = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days validity

    const uploadToken = await CandidateDocumentUploadToken.create({
      onboardingId: onboarding._id,
      candidateId: onboarding.onboardingId,
      candidateName: onboarding.candidateName,
      candidateEmail: onboarding.candidateEmail,
      position: onboarding.position,
      token,
      expiresAt,
      generatedBy: hrUserId,
      documentTypes: ['payslip'], // Restrict to payslip only
      purpose: 'payslip_verification'
    });

    // Update onboarding record
    onboarding.payslipVerification = {
      uploadToken: token,
      uploadTokenExpiry: expiresAt,
      uploadRequestedAt: new Date(),
      uploadRequestedBy: hrUserId,
      verificationStatus: 'pending',
      canReUpload: true
    };

    onboarding.status = 'payslip_verification';
    onboarding.auditTrail.push({
      action: 'payslip_upload_requested',
      description: 'Payslip upload request sent to candidate',
      performedBy: hrUserId,
      previousStatus: 'payslip_upload_requested',
      newStatus: 'payslip_verification',
      metadata: { notes, uploadTokenId: uploadToken._id },
      timestamp: new Date()
    });

    await onboarding.save();

    // Send payslip verification email
    try {
      const tenantId = req.tenant.companyId || req.tenant.clientId;
      const uploadUrl = `http://3.108.172.119/api/public/document-upload/upload/${token}?tenantId=${tenantId}`;
      
      const { sendPayslipVerificationRequestEmail } = require('../services/emailService');
      await sendPayslipVerificationRequestEmail({
        candidateName: onboarding.candidateName,
        candidateEmail: onboarding.candidateEmail,
        position: onboarding.position,
        uploadUrl: uploadUrl,
        expiresAt: expiresAt,
        notes: notes
      });
      
      console.log(`📧 Payslip verification email sent to ${onboarding.candidateEmail}`);
    } catch (emailError) {
      console.error('⚠️ Failed to send payslip verification email:', emailError);
      // Don't fail the request, just log the error
    }

    res.status(200).json({
      success: true,
      message: 'Payslip upload request sent successfully',
      data: {
        onboardingId: onboarding.onboardingId,
        candidateName: onboarding.candidateName,
        candidateEmail: onboarding.candidateEmail,
        uploadToken: token,
        uploadUrl: `http://3.108.172.119/api/public/document-upload/upload/${token}?tenantId=${req.tenant.companyId || req.tenant.clientId}`,
        expiresAt,
        status: 'payslip_verification'
      }
    });

  } catch (error) {
    console.error('Error requesting payslip upload:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to request payslip upload',
      error: error.message
    });
  }
};

/**
 * Verify payslip (Accept/Reject)
 * @route POST /api/onboarding/:id/verify-payslip
 * @access Private (HR only)
 */
exports.verifyPayslip = async (req, res) => {
  try {
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const { id } = req.params;
    const { action, notes } = req.body; // action: 'approve' or 'reject'
    const hrUserId = req.user.id;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be approve or reject'
      });
    }

    const onboarding = await Onboarding.findById(id);
    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }

    // Validate status
    if (onboarding.status !== 'payslip_verification') {
      return res.status(400).json({
        success: false,
        message: 'Cannot verify payslip. Current status must be payslip_verification.',
        currentStatus: onboarding.status
      });
    }

    const previousStatus = onboarding.status;
    const newStatus = action === 'approve' ? 'payslip_approved' : 'payslip_rejected';

    // Update payslip verification details
    onboarding.payslipVerification.verifiedAt = new Date();
    onboarding.payslipVerification.verifiedBy = hrUserId;
    onboarding.payslipVerification.verificationStatus = action === 'approve' ? 'approved' : 'rejected';
    onboarding.payslipVerification.rejectionReason = action === 'reject' ? notes : null;

    // Update onboarding status
    onboarding.status = newStatus;
    onboarding.auditTrail.push({
      action: `payslip_${action === 'approve' ? 'approved' : 'rejected'}`,
      description: `Payslip ${action === 'approve' ? 'approved' : 'rejected'} by HR`,
      performedBy: hrUserId,
      previousStatus,
      newStatus,
      metadata: { notes },
      timestamp: new Date()
    });

    await onboarding.save();

    // Send notification email to candidate
    try {
      const { sendPayslipVerificationResultEmail } = require('../services/emailService');
      await sendPayslipVerificationResultEmail({
        candidateName: onboarding.candidateName,
        candidateEmail: onboarding.candidateEmail,
        position: onboarding.position,
        isApproved: action === 'approve',
        notes: action === 'reject' ? notes : 'Your payslip has been verified and approved.',
        companyName: req.tenant?.companyName || 'SPC MANAGMENT'
      });

      console.log(`📧 Payslip verification result sent to ${onboarding.candidateEmail}`);
    } catch (emailError) {
      console.error('⚠️ Failed to send payslip verification result email:', emailError);
      // Don't fail the request, just log the error
    }

    res.status(200).json({
      success: true,
      message: `Payslip ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
      data: {
        onboardingId: onboarding.onboardingId,
        candidateName: onboarding.candidateName,
        previousStatus,
        newStatus,
        verificationStatus: onboarding.payslipVerification.verificationStatus,
        processedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Error verifying payslip:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payslip',
      error: error.message
    });
  }
};

/**
 * Generate and send agreement letter to employee
 * @route POST /api/onboarding/:id/generate-agreement
 * @access Private (HR/Admin only)
 */
exports.generateAgreement = async (req, res) => {
  try {
    
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const Employee = getTenantModel(req.tenant.connection, 'Employee');
    const AgreementTemplate = getTenantModel(req.tenant.connection, 'AgreementTemplate');
    
    const { id } = req.params;
    const { 
      templateId, 
      agreementDetails = {},
      effectiveDate,
      expiryDate
    } = req.body;

    console.log('📋 Looking for template with ID:', templateId);

    const agreementTemplatesCount = await AgreementTemplate.countDocuments();
    console.log('📊 Agreement templates in this tenant DB:', agreementTemplatesCount);

    // Find onboarding record
    const onboarding = await Onboarding.findById(id);
    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }

    // Check if employee exists, if not use candidate information
    let employee = await Employee.findOne({ email: onboarding.candidateEmail });
    let isCandidate = false;
    
    if (!employee) {
      // Use candidate information instead of employee

      const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
      let candidate = null;
      
      // Try multiple ways to find the candidate
      if (onboarding.candidateId) {
        candidate = await Candidate.findById(onboarding.candidateId);
      }
      
      if (!candidate && onboarding.candidate) {
        candidate = await Candidate.findById(onboarding.candidate);
      }
      
      if (!candidate) {
        // Try finding by email as fallback
        candidate = await Candidate.findOne({ email: onboarding.candidateEmail });
      }
      
      if (!candidate) {
        return res.status(404).json({
          success: false,
          message: 'Candidate record not found. Tried candidateId, candidate field, and email lookup.'
        });
      }
      
      // Create a mock employee object with candidate information
      employee = {
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        employeeCode: candidate.employeeCode || `CAND-${Date.now()}`,
        designation: onboarding.position,
        department: candidate.department || { name: 'Not Assigned' },
        joiningDate: onboarding.joiningDate,
        _id: candidate._id
      };
      isCandidate = true;
      
      console.log('📋 Using candidate info:', {
        name: `${candidate.firstName} ${candidate.lastName}`,
        email: candidate.email,
        position: onboarding.position
      });
    }

    // Get agreement template
    let template = await AgreementTemplate.findById(templateId);
    if (!template) {
      // Fallback: sometimes the frontend might send templateId (string identifier) instead of _id
      template = await AgreementTemplate.findOne({ templateId });
    }
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Agreement template not found',
        debug: {
          requestedTemplateId: templateId,
          tenantDb: req.tenant?.dbName,
          companyId: req.companyId,
          templatesInTenantDb: agreementTemplatesCount
        }
      });
    }

    // Prepare agreement data
    const agreementData = {
      employeeName: `${employee.firstName} ${employee.lastName}`,
      employeeEmail: employee.email,
      employeeCode: employee.employeeCode,
      designation: employee.designation || onboarding.position,
      department: employee.department?.name || 'Not Assigned',
      joiningDate: employee.joiningDate || onboarding.joiningDate,
      effectiveDate: effectiveDate || employee.joiningDate || new Date(),
      expiryDate: expiryDate,
      companyName: req.tenant?.companyName || 'SPC MANAGMENT',
      companyAddress: req.tenant?.companyAddress || 'Company Address',
      ...agreementDetails
    };

    // Replace template variables
    let content = template.content;
    let subject = template.subject;
    
    // Safety checks
    if (!template.variables || !Array.isArray(template.variables)) {
      console.warn('⚠️ Template variables is not an array:', template.variables);
      template.variables = [];
    }
    
    if (!agreementData) {
      console.warn('⚠️ Agreement data is undefined:', agreementData);
      agreementData = {};
    }
    
    if (!agreementDetails) {
      console.warn('⚠️ Agreement details is undefined:', agreementDetails);
      agreementDetails = {};
    }
    
    template.variables.forEach(variable => {
      if (!variable || !variable.key) {
        console.warn('⚠️ Invalid variable:', variable);
        return;
      }
      const regex = new RegExp(`{{${variable.key}}}`, 'g');
      const value = agreementData[variable.key] || agreementDetails[variable.key] || `[${variable.label || variable.key}]`;
      content = content.replace(regex, value);
      subject = subject.replace(regex, value);
    });

    // Update template usage statistics
    template.usageCount += 1;
    template.lastUsedAt = new Date();
    await template.save();

    // Add agreement to onboarding record
    
    const agreementsArray = onboarding.agreements || [];
    
    const agreementRecord = {
      templateId: template._id,
      templateName: template.name,
      content: content,
      subject: subject,
      generatedAt: new Date(),
      generatedBy: req.user.id,
      status: 'generated',
      effectiveDate: new Date(effectiveDate || employee.joiningDate),
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      companyName: req.tenant?.companyName || 'SPC MANAGMENT',
      companyAddress: req.tenant?.companyAddress || 'Company Address',
      ...agreementDetails
    };
    
    agreementsArray.push(agreementRecord);
    
    
    onboarding.agreements = agreementsArray;
    

    // Update status to agreement_generated (not completed yet - HR needs to complete onboarding)
    onboarding.status = 'agreement_generated';
    
    // Initialize statusHistory if it doesn't exist
    if (!onboarding.statusHistory) {
      onboarding.statusHistory = [];
    }
    
    const statusHistoryEntry = {
      status: 'agreement_generated',
      performedBy: req.user?.id || null,
      metadata: { 
        agreementId: agreementsArray[agreementsArray.length - 1]._id,
        templateId: templateId,
        templateName: template.name
      },
      timestamp: new Date()
    };
    
    onboarding.statusHistory.push(statusHistoryEntry);
    
    await onboarding.save();

    // Send agreement email to employee
    try {
      await sendAgreementLetterWithTemplate({
        templateId: templateId,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        employeeEmail: employee.email,
        designation: employee.designation || onboarding.position,
        agreementData: agreementData,
        companyName: req.tenant?.companyName || 'SPC MANAGMENT',
        tenantConnection: req.tenant.connection
      });
      
      agreementRecord.emailSent = true;
      agreementRecord.emailSentAt = new Date();
      await onboarding.save();
      
      console.log(`📧 Agreement letter sent to ${employee.email}`);
    } catch (emailError) {
      console.error('Error sending agreement email:', emailError);
      // Don't fail the request if email fails, just log it
    }

    res.status(200).json({
      success: true,
      message: 'Agreement generated successfully. Please complete the onboarding process to create the employee record.',
      data: {
        agreementId: agreementRecord._id,
        templateName: template.name,
        subject: subject,
        generatedAt: agreementRecord.generatedAt,
        emailSent: agreementRecord.emailSent
      }
    });

  } catch (error) {
    console.error('Error generating agreement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate agreement',
      error: error.message
    });
  }
};

/**
 * Get employee agreements
 * @route GET /api/onboarding/:id/agreements
 * @access Private (HR/Admin only)
 */
exports.getEmployeeAgreements = async (req, res) => {
  try {
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    
    const { id } = req.params;

    const onboarding = await Onboarding.findById(id)
      .populate('agreements.templateId', 'name category')
      .populate('agreements.generatedBy', 'firstName lastName');

    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }

    res.status(200).json({
      success: true,
      data: onboarding.agreements || []
    });

  } catch (error) {
    console.error('Error fetching agreements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agreements',
      error: error.message
    });
  }
};
