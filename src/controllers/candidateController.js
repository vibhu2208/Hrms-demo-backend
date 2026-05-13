const { getTenantModel } = require('../utils/tenantModels');
const {
  sendInterviewNotification,
  sendApplicationReceivedEmail,
  sendShortlistedEmail,
  sendInterviewCompletedEmail,
  sendOfferExtendedEmail,
  sendRejectionEmail
} = require('../services/emailService');
const onboardingAutomationService = require('../services/onboardingAutomationService');
const reductoService = require('../services/reductoService');
const awsS3Service = require('../services/awsS3Service');
const { getS3FileUrl } = require('../middlewares/s3Upload');

exports.getCandidates = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const TenantEmployee = getTenantModel(req.tenant.connection, 'Employee', require('../models/tenant/TenantEmployee'));
    const intelligentSearch = require('../services/intelligentSearchService').intelligentSearch;
    const { stage, status, source, search } = req.query;
    let query = {};
    

    if (stage) query.stage = stage;
    if (status) query.status = status;
    if (source) query.source = source;
    
    // Exclude candidates who are current employees (not ex-employees)
    // Allow ex-employees to appear in candidate list
    query.isEmployee = { $ne: true };
    
    // Also exclude by checking if email matches an active employee (not ex-employees)
    let activeEmployeeEmails = [];
    try {
      const activeEmployees = await TenantEmployee.find({ 
        isActive: true, 
        isExEmployee: { $ne: true } 
      }).select('email').lean();
      activeEmployeeEmails = activeEmployees.map(emp => emp.email?.toLowerCase()).filter(Boolean);
    } catch (err) {
      console.warn('Could not fetch active employees for candidate filtering:', err.message);
    }

    // If no search query, use basic filters
    if (!search || !search.trim()) {
      let candidates = await Candidate.find(query)
        .populate('appliedFor', 'title department')
        .populate('referredBy', 'firstName lastName')
        .select('+resume')
        .sort({ createdAt: -1 });
      
      // Process resume URLs to generate S3 signed URLs
      candidates = await processCandidateResumes(candidates);
      
      // Filter out candidates who are active employees by email (but allow ex-employees)
      if (activeEmployeeEmails.length > 0) {
        candidates = candidates.filter(c => {
          // Allow ex-employees to appear in candidate list
          if (c.isExEmployee) return true;
          const email = c.email?.toLowerCase();
          return !email || !activeEmployeeEmails.includes(email);
        });
      }
      

      return res.status(200).json({ success: true, count: candidates.length, data: candidates });
    }

    // With search query - fetch all candidates and apply intelligent search
    // First, do a basic filter without search
    let allCandidates = await Candidate.find(query)
      .populate('appliedFor', 'title department')
      .populate('referredBy', 'firstName lastName')
      .select('firstName lastName email phone skills experience currentDesignation currentCompany appliedFor candidateCode createdAt resume stage status timeline');
    
    // Filter out candidates who are active employees by email (but allow ex-employees)
    if (activeEmployeeEmails.length > 0) {
      allCandidates = allCandidates.filter(c => {
        // Allow ex-employees to appear in candidate list
        if (c.isExEmployee) return true;
        const email = c.email?.toLowerCase();
        return !email || !activeEmployeeEmails.includes(email);
      });
    }

    // Convert candidates to format expected by intelligentSearch
    const candidateResumes = allCandidates.map(candidate => ({
      _id: candidate._id,
      name: `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Unnamed Candidate',
      email: candidate.email || '',
      phone: candidate.phone || '',
      parsedData: {
        skills: candidate.skills || [],
        experience: {
          years: candidate.experience?.years || 0,
          months: candidate.experience?.months || 0
        },
        currentDesignation: candidate.currentDesignation || '',
        currentCompany: candidate.currentCompany || '',
        previousRoles: []
      },
      searchableText: [
        candidate.firstName || '',
        candidate.lastName || '',
        candidate.email || '',
        (candidate.skills || []).join(' '),
        candidate.currentDesignation || '',
        candidate.currentCompany || ''
      ].join(' ').toLowerCase(),
      rawText: '',
      createdAt: candidate.createdAt || new Date(),
      candidate: candidate // Keep original for reference
    }));

    // Apply intelligent search
    const searchResults = intelligentSearch(candidateResumes, search.trim());

    // Convert back to candidate format with search metadata
    const resultsWithMetadata = searchResults.map(result => {
      const originalCandidate = result.resume?.candidate || result.candidate;
      if (!originalCandidate) {
        // Fallback if candidate not found
        return {
          _id: result.candidateId,
          firstName: result.name.split(' ')[0] || '',
          lastName: result.name.split(' ').slice(1).join(' ') || '',
          email: result.email,
          phone: result.phone,
          skills: result.matchedSkills,
          experience: {
            years: result.experienceYears || 0,
            months: result.experienceMonths || 0
          },
          relevanceScore: result.relevanceScore,
          matchedSkills: result.matchedSkills,
          matchReason: result.reason
        };
      }

      // Re-populate if needed (original candidate may not have populated fields)
      const candidateData = originalCandidate.toObject ? originalCandidate.toObject() : originalCandidate;
      
      return {
        ...candidateData,
        // Add intelligent search metadata
        relevanceScore: result.relevanceScore,
        matchedSkills: result.matchedSkills,
        matchReason: result.reason
      };
    });

    // Process resume URLs for search results
    const processedResults = await processCandidateResumes(resultsWithMetadata);

    // Sort by relevance score (already sorted by intelligentSearch, but ensure it)
    processedResults.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    

    res.status(200).json({ 
      success: true, 
      count: processedResults.length, 
      data: processedResults,
      searchMetadata: {
        query: search,
        searchType: 'intelligent',
        totalResults: processedResults.length
      }
    });
  } catch (error) {
    console.error('Error in getCandidates:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCandidate = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const candidate = await Candidate.findById(req.params.id)
      .populate('appliedFor')
      .populate('referredBy')
      .populate('interviews.interviewer', 'firstName lastName');

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    // Process resume URLs to generate S3 signed URLs
    const processedCandidate = await processCandidateResumes([candidate]);

    res.status(200).json({ success: true, data: processedCandidate[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Helper function to normalize phone number
const normalizePhone = (phone) => {
  if (!phone) return null;
  return phone.replace(/\D/g, '');
};

// Helper function to process candidate resume URLs and generate S3 signed URLs
const processCandidateResumes = async (candidates) => {
  return candidates.map(candidate => {
    const candidateObj = candidate.toObject ? candidate.toObject() : candidate;
    
    // Process resume URL for S3 files
    if (candidateObj.resume) {
      if (candidateObj.resume.isS3File && candidateObj.resume.s3Key) {
        // Generate signed URL for S3 files
        try {
          candidateObj.resume.url = awsS3Service.generateSignedUrl(candidateObj.resume.s3Key, 3600); // 1 hour expiry
        } catch (error) {
          console.error('❌ Error generating signed URL for candidate:', candidateObj._id, error);
          // Keep the original URL as fallback
        }
      }
    }
    
    return candidateObj;
  });
};

exports.createCandidate = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const { email, phone, forceCreate } = req.body;

    // Check for duplicate candidate (non-blocking, but warn)
    let existingCandidate = null;
    if (email || phone) {
      const normalizedEmail = email?.toLowerCase().trim();
      const normalizedPhone = normalizePhone(phone);
      
      const duplicateQuery = {
        $or: []
      };

      if (normalizedEmail) {
        duplicateQuery.$or.push({ email: normalizedEmail });
      }

      if (normalizedPhone) {
        duplicateQuery.$or.push({ phone: normalizedPhone });
        duplicateQuery.$or.push({ alternatePhone: normalizedPhone });
      }

      if (duplicateQuery.$or.length > 0) {
        existingCandidate = await Candidate.findOne(duplicateQuery)
          .select('candidateCode firstName lastName email phone appliedFor stage status timeline')
          .populate('appliedFor', 'title');
      }
    }

    // If duplicate found and not forcing creation, return warning
    if (existingCandidate && !forceCreate) {
      return res.status(200).json({
        success: true,
        message: 'Potential duplicate candidate found',
        isDuplicate: true,
        existingCandidate: {
          id: existingCandidate._id,
          candidateCode: existingCandidate.candidateCode,
          name: `${existingCandidate.firstName} ${existingCandidate.lastName}`,
          email: existingCandidate.email,
          phone: existingCandidate.phone,
          currentJob: existingCandidate.appliedFor?.title,
          stage: existingCandidate.stage,
          status: existingCandidate.status,
          applicationCount: existingCandidate.timeline?.length || 0
        },
        data: null
      });
    }

    // Generate candidate code before creating (to avoid pre-save hook issues)
    if (!req.body.candidateCode) {
      try {
        console.log('Generating candidate code for new candidate...');

        // Find the highest existing candidate code and increment it
        const lastCandidate = await Candidate.findOne({})
          .sort({ candidateCode: -1 })
          .select('candidateCode')
          .lean();

        let nextNumber = 1; // Default for first candidate

        if (lastCandidate && lastCandidate.candidateCode) {
          // Extract number from last code (e.g., "CAN00008" -> 8)
          const lastNumber = parseInt(lastCandidate.candidateCode.replace('CAN', '')) || 0;
          nextNumber = lastNumber + 1;
        }

        // Generate unique code with retry logic for race conditions
        let candidateCode;
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
          candidateCode = `CAN${String(nextNumber + attempts).padStart(5, '0')}`;

          // Check if this code already exists
          const existing = await Candidate.findOne({ candidateCode });
          if (!existing) {
            // Code is unique, use it
            break;
          }

          attempts++;
        }

        // If we couldn't find a unique code after max attempts, use timestamp fallback
        if (attempts >= maxAttempts) {
          candidateCode = `CAN${Date.now().toString().slice(-8)}`;
        }

        req.body.candidateCode = candidateCode;
        console.log(`Generated candidate code: ${candidateCode} for ${req.body.email || 'new candidate'}`);

      } catch (codeGenError) {
        console.error('Error generating candidate code:', codeGenError);
        // Fallback to timestamp-based code
        req.body.candidateCode = `CAN${Date.now().toString().slice(-8)}`;
      }
    }

    // Parse JSON fields if they are strings (from FormData)
    if (typeof req.body.preferredLocation === 'string') {
      try {
        req.body.preferredLocation = JSON.parse(req.body.preferredLocation);
      } catch (e) {
        req.body.preferredLocation = [];
      }
    }
    
    if (typeof req.body.professionalExperience === 'string') {
      try {
        req.body.professionalExperience = JSON.parse(req.body.professionalExperience);
      } catch (e) {
        req.body.professionalExperience = [];
      }
    }
    
    if (typeof req.body.skills === 'string') {
      try {
        req.body.skills = JSON.parse(req.body.skills);
      } catch (e) {
        req.body.skills = [];
      }
    }
    
    if (typeof req.body.education === 'string') {
      try {
        req.body.education = JSON.parse(req.body.education);
      } catch (e) {
        req.body.education = [];
      }
    }
    
    if (typeof req.body.trainingCertificates === 'string') {
      try {
        req.body.trainingCertificates = JSON.parse(req.body.trainingCertificates);
      } catch (e) {
        req.body.trainingCertificates = [];
      }
    }

    // Create candidate
    console.log('Creating candidate with data:', req.body);
    let candidate;
    try {
      candidate = await Candidate.create(req.body);
      console.log('Candidate created successfully:', candidate._id, candidate.candidateCode);
    } catch (createError) {
      console.error('Candidate creation failed:', createError.message);
      console.error('Validation errors:', createError.errors);
      throw createError;
    }

    // Auto-populate candidate fields from parsed resume data if available
    if (req.body.resumeParsing?.extractedData) {
      try {
        const populatedCandidate = await populateCandidateFromResumeData(candidate, req.body.resumeParsing.extractedData);
        if (populatedCandidate) {
          candidate = populatedCandidate;
          console.log('✅ Candidate fields auto-populated from resume data');
        }
      } catch (populateError) {
        console.warn('⚠️ Failed to auto-populate candidate from resume data:', populateError.message);
        // Don't throw - candidate creation succeeded, just log the warning
      }
    }
    
    // If existing candidate found, link them and update application history
    if (existingCandidate) {
      // Determine master candidate (the first one created)
      const masterId = existingCandidate.masterCandidateId || existingCandidate._id;
      candidate.masterCandidateId = masterId;
      
      // If existing candidate is not the master, update it too
      if (existingCandidate.masterCandidateId) {
        const masterCandidate = await Candidate.findById(existingCandidate.masterCandidateId);
        if (masterCandidate) {
          masterCandidate.applicationHistory = masterCandidate.applicationHistory || [];
          masterCandidate.applicationHistory.push({
            jobId: candidate.appliedFor,
            jobTitle: candidate.appliedFor?.title || req.body.jobTitle,
            appliedDate: candidate.createdAt,
            stage: candidate.stage,
            status: candidate.status,
            outcome: null
          });
          await masterCandidate.save();
        }
      } else {
        // Existing candidate is the master, update its history
        existingCandidate.applicationHistory = existingCandidate.applicationHistory || [];
        existingCandidate.applicationHistory.push({
          jobId: candidate.appliedFor,
          jobTitle: candidate.appliedFor?.title || req.body.jobTitle,
          appliedDate: candidate.createdAt,
          stage: candidate.stage,
          status: candidate.status,
          outcome: null
        });
        await existingCandidate.save();
      }
      
      // Also add to new candidate's history
      candidate.applicationHistory = candidate.applicationHistory || [];
      candidate.applicationHistory.push({
        jobId: candidate.appliedFor,
        jobTitle: candidate.appliedFor?.title || req.body.jobTitle,
        appliedDate: candidate.createdAt,
        stage: candidate.stage,
        status: candidate.status,
        outcome: null
      });
      await candidate.save();
    } else {
      // First application - this candidate is the master
      candidate.applicationHistory = candidate.applicationHistory || [];
      candidate.applicationHistory.push({
        jobId: candidate.appliedFor,
        jobTitle: candidate.appliedFor?.title || req.body.jobTitle,
        appliedDate: candidate.createdAt,
        stage: candidate.stage,
        status: candidate.status,
        outcome: null
      });
      await candidate.save();
    }
    
    // Send application received email
    if (candidate.email) {
      try {
        // Populate the appliedFor field to get the job title
        await candidate.populate('appliedFor', 'title');
        
        // Get position from multiple sources in order of preference
        let position = 'Position'; // Default fallback
        
        // Try to get from populated appliedFor.title
        if (candidate.appliedFor?.title) {
          position = candidate.appliedFor.title;
        }
        // Try to get from request body jobTitle
        else if (req.body.jobTitle) {
          position = req.body.jobTitle;
        }
        // Try to get from original candidate data
        else if (candidate.appliedFor && typeof candidate.appliedFor === 'string') {
          // If appliedFor is just an ID string, try to find the job
          try {
            const Job = getTenantModel(req.tenant.connection, 'Job');
            const job = await Job.findById(candidate.appliedFor);
            if (job?.title) {
              position = job.title;
            }
          } catch (jobError) {
            console.warn('Could not fetch job title:', jobError.message);
          }
        }

        await sendApplicationReceivedEmail({
          candidateName: `${candidate.firstName} ${candidate.lastName}`,
          candidateEmail: candidate.email,
          position: position,
          companyName: req.body.companyName || 'SPC MANAGMENT'
        });
        console.log('Application received email sent successfully with position:', position);
      } catch (emailError) {
        console.error('Failed to send application email:', emailError);
        // Don't throw - email failure shouldn't break candidate creation
      }
    }
    
    try {
      // Create a clean response object to avoid serialization issues
      const responseData = {
        success: true,
        message: existingCandidate ? 'Candidate created (linked to existing profile)' : 'Candidate created successfully',
        isDuplicate: candidate.isDuplicate || false,
        linkedToMaster: existingCandidate ? true : false,
        data: {
          _id: candidate._id,
          candidateCode: candidate.candidateCode,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          phone: candidate.phone,
          stage: candidate.stage,
          status: candidate.status,
          createdAt: candidate.createdAt,
          skills: candidate.skills,
          currentCompany: candidate.currentCompany,
          currentDesignation: candidate.currentDesignation
        }
      };

      res.status(201).json(responseData);
      console.log('Response sent successfully for candidate:', candidate._id);
    } catch (responseError) {
      console.error('Error sending response:', responseError);
      // If response already sent, this won't execute
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Error sending response' });
      }
    }
  } catch (error) {
    console.error('Error in createCandidate:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

exports.updateCandidate = async (req, res) => {
  try {
    console.log('📝 Updating candidate:', req.params.id);
    console.log('   Update data:', req.body);
    
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');

    // Get current candidate to check for resume parsing data
    const currentCandidate = await Candidate.findById(req.params.id);
    if (!currentCandidate) {
      console.error('❌ Candidate not found:', req.params.id);
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    // Update the candidate
    let candidate = await Candidate.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    console.log('✅ Candidate updated successfully');

    // Auto-populate from existing resume data if available and fields are now empty
    if (currentCandidate.resumeParsing?.extractedData) {
      try {
        const populatedCandidate = await populateCandidateFromResumeData(candidate, currentCandidate.resumeParsing.extractedData);
        if (populatedCandidate && populatedCandidate._id) {
          candidate = populatedCandidate;
          console.log('✅ Candidate fields auto-populated from existing resume data during update');
        }
      } catch (populateError) {
        console.warn('⚠️ Failed to auto-populate candidate from existing resume data:', populateError.message);
        // Don't throw - update succeeded, just log the warning
      }
    }

    res.status(200).json({ success: true, message: 'Candidate updated successfully', data: candidate });
  } catch (error) {
    console.error('❌ Error in updateCandidate:', error);
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateStage = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const { stage, skipValidation = false, reason } = req.body;
    const candidate = await Candidate.findById(req.params.id).populate('appliedFor');

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    // BLOCK STATUS CHANGES FOR CANDIDATES ALREADY IN ONBOARDING
    const onboardingStages = ['sent-to-onboarding', 'joined', 'completed'];
    if (onboardingStages.includes(candidate.stage) && !skipValidation) {
      return res.status(403).json({
        success: false,
        message: `Cannot change status: Candidate is already in onboarding process (${candidate.stage}). All hiring activities are blocked for this candidate.`,
        blocked: true,
        currentStage: candidate.stage
      });
    }

    // Also check if candidate has an active onboarding record
    const existingOnboarding = await Onboarding.findOne({
      candidateId: candidate._id,
      status: { $nin: ['rejected', 'cancelled'] }
    });

    if (existingOnboarding && !skipValidation) {
      return res.status(403).json({
        success: false,
        message: `Cannot change status: Candidate has an active onboarding record. All hiring activities are blocked.`,
        blocked: true,
        onboardingId: existingOnboarding._id,
        onboardingStatus: existingOnboarding.status
      });
    }

    const previousStage = candidate.stage;
    
    // Track workflow history
    const workflowEntry = {
      fromStage: previousStage,
      toStage: stage,
      skippedStages: [],
      movedBy: req.user?._id || req.user?.id,
      reason: reason || `Stage changed from ${previousStage} to ${stage}`,
      timestamp: new Date()
    };

    // If skipping stages, identify which stages were skipped
    const allStages = ['applied', 'screening', 'shortlisted', 'interview-scheduled', 
                       'interview-completed', 'offer-extended', 'offer-accepted', 
                       'offer-rejected', 'sent-to-onboarding', 'joined', 'rejected'];
    const fromIndex = allStages.indexOf(previousStage);
    const toIndex = allStages.indexOf(stage);
    
    if (fromIndex >= 0 && toIndex >= 0 && Math.abs(toIndex - fromIndex) > 1) {
      // Stages were skipped
      const start = Math.min(fromIndex, toIndex);
      const end = Math.max(fromIndex, toIndex);
      workflowEntry.skippedStages = allStages.slice(start + 1, end);
    }

    candidate.stage = stage;
    candidate.workflowHistory = candidate.workflowHistory || [];
    candidate.workflowHistory.push(workflowEntry);
    await candidate.save();

    // Send emails based on stage change
    const candidateName = `${candidate.firstName} ${candidate.lastName}`;
    const position = candidate.appliedFor?.title || 'Position';
    const companyName = req.body.companyName || 'SPC MANAGMENT';

    // Send shortlisted email
    if (stage === 'shortlisted' && previousStage !== 'shortlisted') {
      sendShortlistedEmail({
        candidateName,
        candidateEmail: candidate.email,
        position,
        companyName
      }).catch(err => console.error('Failed to send shortlisted email:', err.message));
    }

    // Send offer extended email
    if (stage === 'offer-extended' && previousStage !== 'offer-extended') {
      sendOfferExtendedEmail({
        candidateName,
        candidateEmail: candidate.email,
        position,
        joiningDate: candidate.offerDetails?.joiningDate,
        companyName
      }).catch(err => console.error('Failed to send offer email:', err.message));

      // Log HR activity for offer extended
      try {
        const { logOfferExtended } = require('../services/hrActivityLogService');
        await logOfferExtended(req.tenant.connection, {
          _id: candidate._id,
          candidateName: `${candidate.firstName} ${candidate.lastName}`,
          position,
          candidateEmail: candidate.email
        }, req);
        console.log(`📝 HR activity logged for offer extended via stage change to ${candidate.firstName} ${candidate.lastName}`);
      } catch (logError) {
        console.error('⚠️ Failed to log HR activity for offer extended:', logError.message);
      }
    }

    // Send rejection email
    if (stage === 'rejected' && previousStage !== 'rejected') {
      sendRejectionEmail({
        candidateName,
        candidateEmail: candidate.email,
        position,
        companyName
      }).catch(err => console.error('Failed to send rejection email:', err.message));
    }

    // Automatically create onboarding when candidate is shortlisted
    if (stage === 'shortlisted' && previousStage !== 'shortlisted') {
      // Check if already in onboarding
      const existingOnboarding = await Onboarding.findOne({ candidateEmail: candidate.email });
      
      if (!existingOnboarding) {
        try {
          // Create onboarding record
          await Onboarding.create({
            candidateName: `${candidate.firstName} ${candidate.lastName}`,
            candidateEmail: candidate.email,
            candidatePhone: candidate.phone,
            position: candidate.appliedFor?.title || candidate.currentDesignation || 'Position',
            department: candidate.appliedFor?.department,
            joiningDate: candidate.offerDetails?.joiningDate,
            stages: ['interview1', 'hrDiscussion', 'documentation', 'success'],
            currentStage: 'interview1',
            status: 'in-progress',
            notes: `Auto-created from recruitment. Applied for: ${candidate.appliedFor?.title || 'N/A'}`
          });
        } catch (onboardingError) { }
      }
    }

    // Create onboarding record when moving to sent-to-onboarding
    if (stage === 'sent-to-onboarding' && previousStage !== 'sent-to-onboarding') {
      console.log('🔄 Creating onboarding record for sent-to-onboarding stage...');
      
      // Check if already has onboarding
      let existingOnboarding = await Onboarding.findOne({ candidateEmail: candidate.email });
      
      if (!existingOnboarding) {
        try {
          // Validate job posting has department
          if (!candidate.appliedFor?.department) {
            console.warn('⚠️ Candidate has no job posting with department. Onboarding record not created.');
            return res.status(400).json({
              success: false,
              message: 'Cannot move to onboarding: Candidate must be assigned to a job posting with a department. Please update the candidate first.'
            });
          }

          // Create onboarding record
          const onboarding = await Onboarding.create({
            applicationId: candidate._id,
            jobId: candidate.appliedFor._id,
            candidateName: `${candidate.firstName} ${candidate.lastName}`,
            candidateEmail: candidate.email,
            candidatePhone: candidate.phone,
            position: candidate.appliedFor.title || 'Position',
            department: candidate.appliedFor.department,
            joiningDate: candidate.offerDetails?.joiningDate,
            status: 'preboarding',
            createdBy: req.user?._id,
            assignedHR: req.user?._id,
            requiredDocuments: [
              { type: 'aadhar', isRequired: true },
              { type: 'pan', isRequired: true },
              { type: 'bank_details', isRequired: true },
              { type: 'address_proof', isRequired: true },
              { type: 'education_certificates', isRequired: true },
              { type: 'photo', isRequired: true }
            ],
            auditTrail: [{
              action: 'moved_to_onboarding',
              description: reason || 'Candidate moved to onboarding via stage change',
              performedBy: req.user?._id,
              previousStatus: previousStage,
              newStatus: 'preboarding',
              timestamp: new Date()
            }]
          });

          candidate.onboardingRecord = onboarding._id;
          candidate.sentToOnboardingAt = new Date();
          candidate.sentToOnboardingBy = req.user?._id;
          await candidate.save();

          console.log('✅ Onboarding record created:', onboarding._id);

          // Generate document upload token
          const CandidateDocumentUploadToken = getTenantModel(req.tenant.connection, 'CandidateDocumentUploadToken');
          if (CandidateDocumentUploadToken) {
            try {
              const token = require('crypto').randomBytes(32).toString('hex');
              const expiresAt = new Date();
              expiresAt.setDate(expiresAt.getDate() + 30);

              await CandidateDocumentUploadToken.create({
                onboardingId: onboarding._id,
                candidateName: onboarding.candidateName,
                candidateEmail: onboarding.candidateEmail,
                position: onboarding.position,
                token,
                expiresAt,
                generatedBy: req.user?._id
              });

              const tenantId = req.tenant.companyId || req.tenant.clientId;
              const uploadUrl = `http://3.108.172.119/public/upload-documents/${token}?tenantId=${tenantId}`;

              // Send offer letter with document link
              const { sendOfferLetterWithDocumentLink } = require('../services/emailService');
              await sendOfferLetterWithDocumentLink({
                candidateName: onboarding.candidateName,
                candidateEmail: onboarding.candidateEmail,
                position: onboarding.position,
                joiningDate: onboarding.joiningDate,
                uploadUrl,
                companyName: req.tenant?.companyName || 'Our Company'
              });
              console.log('✅ Offer letter with document link sent');
            } catch (tokenError) {
              console.error('⚠️ Error generating upload token:', tokenError.message);
            }
          }
        } catch (onboardingError) {
          console.error('❌ Error creating onboarding record:', onboardingError);
          return res.status(500).json({
            success: false,
            message: `Failed to create onboarding record: ${onboardingError.message}`
          });
        }
      } else {
        console.log('ℹ️ Onboarding record already exists for this candidate');
      }
    }

    res.status(200).json({ success: true, message: 'Stage updated successfully', data: candidate });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Move candidate to any stage (flexible workflow)
exports.moveToStage = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    
    if (!Candidate) {
      console.error('❌ Candidate model not found');
      return res.status(500).json({ 
        success: false, 
        message: 'Candidate model not available' 
      });
    }
    
    const { targetStage, skipIntermediate = true, reason, directToOnboarding = false, skippedStage } = req.body;

    if (!targetStage && !directToOnboarding) {
      return res.status(400).json({
        success: false,
        message: 'targetStage is required'
      });
    }
    
    const candidate = await Candidate.findById(req.params.id).populate('appliedFor');

    if (!candidate) {
      console.error('❌ Candidate not found:', req.params.id);
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    
    console.log('✅ Candidate found:', candidate.candidateCode);

    const previousStage = candidate.stage;
    let finalStage = targetStage;

    // If direct to onboarding, handle specially
    if (directToOnboarding || targetStage === 'sent-to-onboarding') {
      console.log('🔄 Handling onboarding...');
      
      if (!Onboarding) {
        console.warn('⚠️ Onboarding model not available, skipping onboarding creation');
      } else {
        try {
          // Check if onboarding already exists
          const existingOnboarding = await Onboarding.findOne({ candidateEmail: candidate.email });
          
          if (!existingOnboarding) {
            console.log('📝 Creating onboarding record...');
            // Create onboarding record
            const onboardingData = {
              candidateName: `${candidate.firstName} ${candidate.lastName}`,
              candidateEmail: candidate.email,
              candidatePhone: candidate.phone || '',
              position: candidate.appliedFor?.title || candidate.currentDesignation || 'Position',
              department: candidate.appliedFor?.department || null,
              joiningDate: candidate.offerDetails?.joiningDate || null,
              stages: ['preboarding'],
              currentStage: 'preboarding',
              status: 'preboarding',
              notes: reason || 'Directly moved to onboarding',
              applicationId: candidate._id,
              jobId: candidate.appliedFor?._id || null
            };
            
            await Onboarding.create(onboardingData);
            console.log('✅ Onboarding record created');
          } else {
            console.log('ℹ️ Onboarding record already exists');
          }
        } catch (onboardingError) {
          console.error('⚠️ Error creating onboarding record:', onboardingError.message);
          // Don't fail the whole operation if onboarding creation fails
        }
      }

      finalStage = 'sent-to-onboarding';
    }

    candidate.stage = finalStage;

    // Track workflow history
    const workflowEntry = {
      fromStage: previousStage,
      toStage: finalStage,
      skippedStages: skipIntermediate ? ['intermediate stages skipped'] : [],
      movedBy: req.user?._id || req.user?.id,
      reason: reason || `Directly moved to ${finalStage}`,
      timestamp: new Date()
    };

    candidate.workflowHistory = candidate.workflowHistory || [];
    candidate.workflowHistory.push(workflowEntry);

    // Update timeline
    candidate.timeline = candidate.timeline || [];
    let description = `Moved directly to ${finalStage}`;
    if (skipIntermediate) {
      if (skippedStage) {
        description += ` (skipped ${skippedStage})`;
      } else {
        description += ' (stages skipped)';
      }
    }

    candidate.timeline.push({
      action: 'Stage Changed',
      description: description,
      performedBy: req.user?._id,
      timestamp: new Date(),
      ...(skippedStage && { skippedStage: skippedStage })
    });
    
    await candidate.save();
    
    console.log('✅ Candidate stage updated successfully');

    res.status(200).json({
      success: true,
      message: `Candidate moved to ${finalStage} successfully`,
      data: candidate
    });
  } catch (error) {
    console.error('❌ Error in moveToStage:', error);
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to move candidate to stage',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

exports.scheduleInterview = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const { interviewType, round, scheduledDate, scheduledTime, meetingLink, meetingPlatform, interviewer } = req.body;
    const candidate = await Candidate.findById(req.params.id)
      .populate('appliedFor', 'title')
      .populate('interviews.interviewer', 'firstName lastName');

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    // Note: Email will be sent after scheduling the interview
    // Removed the requirement for email to be sent before scheduling

    const interviewData = {
      interviewType: interviewType || 'Technical',
      round,
      scheduledDate,
      scheduledTime,
      meetingLink,
      meetingPlatform: meetingPlatform || 'Google Meet',
      interviewer: Array.isArray(interviewer) ? interviewer : [interviewer],
      status: 'scheduled'
    };

    candidate.interviews.push(interviewData);
    candidate.stage = 'interview-scheduled';
    
    // Add to timeline
    candidate.timeline.push({
      action: 'Interview Scheduled',
      description: `${interviewType || 'Technical'} interview scheduled for ${new Date(scheduledDate).toLocaleDateString()}`,
      performedBy: req.user?._id,
      metadata: { interviewType, round, scheduledDate }
    });

    await candidate.save();

    // Send interview notification email automatically
    const newInterview = candidate.interviews[candidate.interviews.length - 1];
    const companyName = req.body.companyName || 'SPC MANAGMENT';
    
    try {
      console.log('📧 Sending interview notification email to:', candidate.email);
      console.log('📧 Email configuration check - EMAIL_USER:', process.env.EMAIL_USER);
      console.log('📧 Interview details:', {
        interviewType,
        scheduledDate,
        scheduledTime,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        position: candidate.appliedFor?.title
      });
      
      await sendInterviewNotification({
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        candidateEmail: candidate.email,
        interviewType: interviewType || 'Technical',
        interviewDate: scheduledDate,
        interviewTime: scheduledTime,
        meetingLink: meetingLink,
        meetingPlatform: meetingPlatform || 'Google Meet',
        interviewerName: null, // Will be populated if interviewer data available
        position: candidate.appliedFor?.title || 'Position',
        companyName: companyName
      });
      
      console.log('✅ Interview notification email sent successfully to:', candidate.email);
      
      // Update notification tracking
      candidate.timeline.push({
        action: 'Interview Email Sent',
        description: `Interview notification email sent for ${interviewType || 'Technical'} interview`,
        performedBy: req.user?._id,
        metadata: { 
          interviewId: newInterview._id,
          emailSent: true
        }
      });
      
      await candidate.save();
    } catch (emailError) {
      console.error('❌ Failed to send interview notification email:', emailError);
      console.error('❌ Email error details:', {
        candidateEmail: candidate.email,
        interviewType,
        scheduledDate,
        error: emailError.message
      });
      // Don't fail the interview scheduling if email fails
    }

    res.status(200).json({ success: true, message: 'Interview scheduled successfully and notification sent', data: candidate });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.convertToEmployee = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const Employee = getTenantModel(req.tenant.connection, 'Employee');
    const candidate = await Candidate.findById(req.params.id);

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    if (candidate.stage !== 'joined') {
      return res.status(400).json({ success: false, message: 'Candidate has not joined yet' });
    }

    // Create employee from candidate data
    const employeeData = {
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone,
      designation: candidate.offerDetails.offeredDesignation,
      joiningDate: candidate.offerDetails.joiningDate,
      education: candidate.education,
      salary: {
        total: candidate.offerDetails.offeredCTC
      }
    };

    const employee = await Employee.create(employeeData);

    // Update candidate status
    candidate.status = 'hired';
    await candidate.save();

    res.status(201).json({ 
      success: true, 
      message: 'Candidate converted to employee successfully', 
      data: employee 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.moveToOnboarding = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const CandidateDocumentUploadToken = getTenantModel(req.tenant.connection, 'CandidateDocumentUploadToken');
    const candidate = await Candidate.findById(req.params.id).populate('appliedFor');

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    // Validate required fields
    if (!candidate.appliedFor || !candidate.appliedFor._id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Candidate must have an associated job posting to move to onboarding' 
      });
    }

    if (!candidate.appliedFor.department) {
      return res.status(400).json({ 
        success: false, 
        message: 'Job posting must have an associated department' 
      });
    }

    // Check if candidate is shortlisted or offer-accepted
    if (!['shortlisted', 'offer-accepted', 'offer-extended', 'active'].includes(candidate.stage)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Only shortlisted or offer-accepted candidates can be moved to onboarding' 
      });
    }

    // Check if already in onboarding - if exists and not completed, update it instead
    let existingOnboarding = await Onboarding.findOne({ candidateEmail: candidate.email });
    let onboarding;
    
    if (existingOnboarding) {
      // If onboarding exists but is not completed, update it
      if (existingOnboarding.status === 'completed') {
        return res.status(400).json({ 
          success: false, 
          message: 'Candidate has already completed onboarding' 
        });
      }
      
      // Update existing onboarding record
      console.log(`♻️ Updating existing onboarding record for ${candidate.email}`);
      existingOnboarding.applicationId = candidate._id;
      existingOnboarding.jobId = candidate.appliedFor._id;
      existingOnboarding.candidateName = `${candidate.firstName} ${candidate.lastName}`;
      existingOnboarding.candidatePhone = candidate.phone;
      existingOnboarding.position = candidate.appliedFor.title || 'Position';
      existingOnboarding.department = candidate.appliedFor.department;
      existingOnboarding.joiningDate = candidate.offerDetails?.joiningDate || req.body.joiningDate;
      existingOnboarding.status = 'preboarding';
      existingOnboarding.createdBy = req.user._id;
      existingOnboarding.assignedHR = req.user._id;
      
      // Add audit trail entry
      if (!existingOnboarding.auditTrail) existingOnboarding.auditTrail = [];
      existingOnboarding.auditTrail.push({
        action: 'reinitialized',
        description: 'Onboarding record reinitialized from recruitment',
        performedBy: req.user._id,
        previousStatus: existingOnboarding.status,
        newStatus: 'preboarding',
        metadata: { notes: 'Re-moved from recruitment' },
        timestamp: new Date()
      });
      
      await existingOnboarding.save();
      onboarding = existingOnboarding;
    } else {
      // Create new onboarding record with correct schema fields
      onboarding = await Onboarding.create({
      applicationId: candidate._id,
      jobId: candidate.appliedFor._id,
      candidateName: `${candidate.firstName} ${candidate.lastName}`,
      candidateEmail: candidate.email,
      candidatePhone: candidate.phone,
      position: candidate.appliedFor.title || 'Position',
      department: candidate.appliedFor.department,
      joiningDate: candidate.offerDetails?.joiningDate || req.body.joiningDate,
      status: 'preboarding',
      createdBy: req.user._id,
      assignedHR: req.user._id,
      requiredDocuments: [
        { type: 'aadhar', isRequired: true },
        { type: 'pan', isRequired: true },
        { type: 'bank_details', isRequired: true },
        { type: 'address_proof', isRequired: true },
        { type: 'education_certificates', isRequired: true },
        { type: 'photo', isRequired: true }
      ],
      auditTrail: [{
        action: 'moved_to_onboarding',
        description: 'Candidate moved to onboarding from recruitment',
        performedBy: req.user._id,
        previousStatus: candidate.stage,
        newStatus: 'preboarding',
        metadata: { notes: `Moved from recruitment. Applied for: ${candidate.appliedFor?.title || 'N/A'}` },
        timestamp: new Date()
      }],
      sla: {
        expectedCompletionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    }

    // Auto-generate document upload token
    const { sendOfferLetterWithDocumentLink } = require('../services/emailService');
    let uploadUrl = null;
    
    if (CandidateDocumentUploadToken) {
      try {
        const token = require('crypto').randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const uploadToken = await CandidateDocumentUploadToken.create({
          onboardingId: onboarding._id,
          candidateId: onboarding.onboardingId,
          candidateName: onboarding.candidateName,
          candidateEmail: onboarding.candidateEmail,
          position: onboarding.position,
          token,
          expiresAt,
          generatedBy: req.user._id
        });

        const tenantId = req.tenant.companyId || req.tenant.clientId;
        // Hard-coded public upload URL as requested
        uploadUrl = `http://3.108.172.119/public/upload-documents/${token}?tenantId=${tenantId}`;
        console.log(`✅ Upload token generated for ${onboarding.candidateName}: ${uploadUrl}`);

        // Send offer letter with document upload link
        await sendOfferLetterWithDocumentLink({
          candidateName: onboarding.candidateName,
          candidateEmail: onboarding.candidateEmail,
          position: onboarding.position,
          joiningDate: onboarding.joiningDate,
          uploadUrl,
          companyName: req.tenant?.companyName || 'SPC MANAGMENT'
        });
        console.log(`📧 Offer letter with document link sent to ${onboarding.candidateEmail}`);
      } catch (tokenError) {
        console.error('Error generating upload token:', tokenError);
      }
    }

    // Update candidate stage
    candidate.stage = 'sent-to-onboarding';
    candidate.onboardingRecord = onboarding._id;
    candidate.sentToOnboardingAt = new Date();
    candidate.sentToOnboardingBy = req.user._id;
    await candidate.save();

    res.status(201).json({ 
      success: true, 
      message: 'Candidate moved to onboarding successfully', 
      data: onboarding,
      uploadUrl 
    });
  } catch (error) {
    console.error('Error moving candidate to onboarding:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCandidate = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const candidate = await Candidate.findByIdAndDelete(req.params.id);
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    res.status(200).json({ success: true, message: 'Candidate deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update interview feedback
exports.updateInterviewFeedback = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const { candidateId, interviewId } = req.params;
    const { feedback, rating, decision, notes, status } = req.body;

    const candidate = await Candidate.findById(candidateId);
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const interview = candidate.interviews.id(interviewId);
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found' });
    }

    // Update interview details
    if (feedback !== undefined) interview.feedback = feedback;
    if (rating !== undefined) interview.rating = rating;
    if (decision !== undefined) interview.decision = decision;
    if (notes !== undefined) interview.notes = notes;
    if (status !== undefined) {
      interview.status = status;
      if (status === 'completed') {
        interview.completedAt = new Date();
        candidate.stage = 'interview-completed';
        
        // Send interview completed email
        await candidate.populate('appliedFor', 'title');
        await sendInterviewCompletedEmail({
          candidateName: `${candidate.firstName} ${candidate.lastName}`,
          candidateEmail: candidate.email,
          interviewType: interview.interviewType || 'Interview',
          position: candidate.appliedFor?.title || 'Position',
          companyName: req.body.companyName || 'SPC MANAGMENT'
        }).catch(err => console.error('Failed to send interview completed email:', err.message));
      }
    }

    // Add to timeline
    candidate.timeline.push({
      action: 'Interview Feedback Added',
      description: `Feedback submitted for ${interview.interviewType} interview - Decision: ${decision || 'Pending'}`,
      performedBy: req.user?._id,
      metadata: { interviewId, rating, decision }
    });

    await candidate.save();

    // 🔥 AUTO-MOVE TO ONBOARDING: Check if HR call completed with selected decision
    const isHRInterview = interview.interviewType?.toLowerCase().includes('hr') || 
                          interview.round?.toLowerCase().includes('hr');
    const isCompleted = status === 'completed';
    const isSelected = decision === 'selected' || decision === 'hire';

    if (isHRInterview && isCompleted && isSelected) {
      console.log('🎯 HR call completed with selection - Auto-moving to onboarding...');
      
      try {
        // Update candidate final decision
        candidate.finalDecision = 'selected';
        candidate.status = 'selected';
        await candidate.save();

        // Auto-create onboarding record
        const onboardingResult = await onboardingAutomationService.autoMoveToOnboarding(
          candidate._id,
          req.tenant.connection,
          {
            selectedBy: req.user?._id,
            comments: notes || feedback
          }
        );

        if (onboardingResult.success && !onboardingResult.alreadyExists) {
          console.log('✅ Candidate automatically moved to onboarding');
          
          // Add timeline entry
          candidate.timeline.push({
            action: 'Auto-moved to Onboarding',
            description: 'Candidate automatically moved to onboarding after HR selection',
            performedBy: req.user?._id,
            metadata: { 
              onboardingId: onboardingResult.onboarding._id,
              automated: true
            }
          });
          await candidate.save();
        }
      } catch (autoMoveError) {
        console.error('❌ Failed to auto-move to onboarding:', autoMoveError.message);
        // Don't fail the interview update if onboarding creation fails
      }
    }
    res.status(200).json({ success: true, message: 'Interview feedback updated successfully', data: candidate });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Send notification (Email/Call)
exports.sendNotification = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const { id } = req.params;
    const { type, notes } = req.body; // type: 'interviewEmail', 'interviewCall', 'offerEmail', 'rejectionEmail'

    const candidate = await Candidate.findById(id).populate('appliedFor', 'title');
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    if (!candidate.notifications) {
      candidate.notifications = {};
    }

    const candidateName = `${candidate.firstName} ${candidate.lastName}`;
    const position = candidate.appliedFor?.title || 'Position';
    const companyName = req.body.companyName || 'SPC MANAGMENT';

    // Update notification status
    if (type === 'interviewEmail') {
      // Send shortlisted email
      try {
        await sendShortlistedEmail({
          candidateName,
          candidateEmail: candidate.email,
          position,
          companyName
        });
        
        candidate.notifications.interviewEmail = {
          sent: true,
          sentAt: new Date(),
          sentBy: req.user?._id
        };
        candidate.timeline.push({
          action: 'Shortlisted Email Sent',
          description: 'Shortlisted notification email sent to candidate',
          performedBy: req.user?._id
        });
      } catch (emailError) {
        console.error('Failed to send shortlisted email:', emailError);
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to send email notification',
          error: emailError.message 
        });
      }
    } else if (type === 'interviewCall') {
      candidate.notifications.interviewCall = {
        completed: true,
        completedAt: new Date(),
        completedBy: req.user?._id,
        notes: notes || ''
      };
      candidate.timeline.push({
        action: 'Interview Call Completed',
        description: 'Interview notification call completed',
        performedBy: req.user?._id,
        metadata: { notes }
      });
    } else if (type === 'offerEmail') {
      candidate.notifications.offerEmail = {
        sent: true,
        sentAt: new Date(),
        sentBy: req.user?._id
      };
      candidate.timeline.push({
        action: 'Offer Email Sent',
        description: 'Offer letter sent to candidate',
        performedBy: req.user?._id
      });
    } else if (type === 'rejectionEmail') {
      candidate.notifications.rejectionEmail = {
        sent: true,
        sentAt: new Date(),
        sentBy: req.user?._id
      };
      candidate.timeline.push({
        action: 'Rejection Email Sent',
        description: 'Rejection notification sent to candidate',
        performedBy: req.user?._id
      });
    }

    await candidate.save();
    res.status(200).json({ success: true, message: 'Notification sent successfully', data: candidate });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update HR Call
exports.updateHRCall = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const { id } = req.params;
    const { status, scheduledDate, completedDate, summary, decision } = req.body;


    const candidate = await Candidate.findById(id).populate('appliedFor', 'title department');
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    // Check if interview scheduling was skipped
    const interviewSchedulingSkipped = candidate.timeline?.some(activity => {
      const action = (activity.action || '').toLowerCase();
      const description = (activity.description || '').toLowerCase();
      const reason = (activity.reason || '').toLowerCase();

      const hasSkipIndicator = action.includes('skip') || description.includes('skip') || reason.includes('skip');
      const hasStageMatch = description.includes('interview') || description.includes('scheduling');

      return hasSkipIndicator && hasStageMatch;
    });

    // Validation: At least one interview must be completed with feedback before HR call
    // (unless interview scheduling was skipped)
    const hasCompletedInterview = candidate.interviews?.some(
      interview => interview.status === 'completed' && interview.feedback && interview.rating
    );


    if (!hasCompletedInterview && !interviewSchedulingSkipped && status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'At least one interview must be completed with feedback before conducting HR call, or skip interview scheduling first'
      });
    }

    if (!candidate.hrCall) {
      candidate.hrCall = {};
    }

    // Update HR call details
    if (status !== undefined) candidate.hrCall.status = status;
    if (scheduledDate !== undefined) candidate.hrCall.scheduledDate = scheduledDate;
    if (completedDate !== undefined) candidate.hrCall.completedDate = completedDate;
    if (summary !== undefined) candidate.hrCall.summary = summary;
    if (decision !== undefined) candidate.hrCall.decision = decision;
    candidate.hrCall.conductedBy = req.user?._id;

    // Define email variables BEFORE using them
    const candidateName = `${candidate.firstName} ${candidate.lastName}`;
    const position = candidate.appliedFor?.title || 'Position';
    const companyName = req.body.companyName || 'SPC MANAGMENT';

    // Add to timeline
    let timelineDesc = 'HR call updated';
    if (status === 'completed') {
      timelineDesc = `HR call completed - Decision: ${decision || 'Pending'}`;
      
      // Send HR call completed email
      try {
        await sendInterviewCompletedEmail({
          candidateName,
          candidateEmail: candidate.email,
          interviewType: 'HR',
          position,
          companyName
        });
        console.log('✅ HR call completed email sent to:', candidate.email);
      } catch (emailError) {
        console.error('❌ Failed to send HR call completed email:', emailError.message);
      }
    } else if (status === 'scheduled' && scheduledDate) {
      try {
        const scheduleDate = new Date(scheduledDate);
        timelineDesc = `HR call scheduled for ${scheduleDate.toLocaleDateString()}`;
        
        // Send HR call scheduled email
        try {
          await sendInterviewNotification({
            candidateName,
            candidateEmail: candidate.email,
            interviewType: 'HR',
            interviewDate: scheduledDate,
            interviewTime: '',
            meetingLink: '',
            meetingPlatform: '',
            interviewerName: null,
            position,
            companyName
          });
          console.log('✅ HR call scheduled email sent to:', candidate.email);
        } catch (emailError) {
          console.error('❌ Failed to send HR call scheduled email:', emailError.message);
        }
      } catch (dateError) {
        console.warn('Invalid scheduledDate provided:', scheduledDate);
        timelineDesc = 'HR call scheduled';
      }
    }

    candidate.timeline.push({
      action: 'HR Call Updated',
      description: timelineDesc,
      performedBy: req.user?._id,
      metadata: { status, decision }
    });

    // Handle decision outcomes and send emails
    const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : status;
    const normalizedDecision = typeof decision === 'string' ? decision.trim().toLowerCase() : decision;

    const onboardingDecisionTriggers = ['selected', 'move-to-onboarding'];

    console.log(`🔍 Checking automatic onboarding condition:`);
    console.log(`   status === 'completed': ${normalizedStatus === 'completed'} (actual: '${normalizedStatus}')`);
    console.log(`   decision triggers onboarding: ${onboardingDecisionTriggers.includes(normalizedDecision)} (actual: '${normalizedDecision}')`);
    console.log(`   Both conditions: ${normalizedStatus === 'completed' && onboardingDecisionTriggers.includes(normalizedDecision)}`);

    // Automatically move to onboarding when HR call is completed with a final positive decision
    if (normalizedStatus === 'completed' && onboardingDecisionTriggers.includes(normalizedDecision)) {
      try {
      console.log(`🎯 HR call completed with 'selected' decision for ${candidateName}`);
      console.log(`   Candidate ID: ${candidate._id}`);
      console.log(`   Applied For: ${candidate.appliedFor?._id}`);
      console.log(`   Department: ${candidate.appliedFor?.department}`);
      
      candidate.stage = 'sent-to-onboarding';
      
      // Send offer extended email
      try {
        await sendOfferExtendedEmail({
          candidateName,
          candidateEmail: candidate.email,
          position,
          joiningDate: candidate.offerDetails?.joiningDate,
          companyName
        });

        candidate.timeline.push({
          action: 'Offer Email Sent',
          description: 'Offer letter email sent to candidate after HR call completion',
          performedBy: req.user?._id
        });

        // Log HR activity for offer sent
        try {
          const { logOfferExtended } = require('../services/hrActivityLogService');
          await logOfferExtended(req.tenant.connection, {
            _id: candidate.onboardingRecord || candidate._id,
            candidateName: `${candidate.firstName} ${candidate.lastName}`,
            position,
            candidateEmail: candidate.email
          }, req);
          console.log(`📝 HR activity logged for offer extended to ${candidate.firstName} ${candidate.lastName}`);
        } catch (logError) {
          console.error('⚠️ Failed to log HR activity for offer extended:', logError.message);
        }
      } catch (emailError) {
        console.error('Failed to send offer email:', emailError);
      }
      
      // Automatically create onboarding record
      console.log(`🔍 Checking for existing onboarding record for ${candidate.email}...`);
      const existingOnboarding = await Onboarding.findOne({ 
        $or: [
          { candidateEmail: candidate.email },
          { applicationId: candidate._id }
        ]
      });
      
      if (existingOnboarding) {
        console.log(`♻️ Existing onboarding found (${existingOnboarding._id}). Updating/linking it...`);
        try {
          if (existingOnboarding.status !== 'completed') {
            existingOnboarding.applicationId = candidate._id;
            existingOnboarding.jobId = candidate.appliedFor?._id;
            existingOnboarding.candidateName = `${candidate.firstName} ${candidate.lastName}`;
            existingOnboarding.candidateEmail = candidate.email;
            existingOnboarding.candidatePhone = candidate.phone;
            existingOnboarding.position = candidate.appliedFor?.title || candidate.currentDesignation || 'Position';
            existingOnboarding.department = candidate.appliedFor?.department;
            existingOnboarding.status = 'preboarding';
            await existingOnboarding.save();
          }

          candidate.onboardingRecord = existingOnboarding._id;
          candidate.sentToOnboardingAt = candidate.sentToOnboardingAt || new Date();
          candidate.sentToOnboardingBy = candidate.sentToOnboardingBy || req.user?._id;
        } catch (updateExistingError) {
          console.error('❌ Failed to update/link existing onboarding:', updateExistingError.message);
        }
      } else {
        console.log(`✅ No existing onboarding found. Creating new onboarding record...`);
        try {
          // Validate required fields before creating onboarding
          if (!candidate.appliedFor || !candidate.appliedFor._id) {
            console.error('❌ Cannot create onboarding: Missing job posting');
            console.error('   Candidate appliedFor:', candidate.appliedFor);
            throw new Error('Job posting is required for onboarding');
          }
          
          if (!candidate.appliedFor.department) {
            console.error('❌ Cannot create onboarding: Missing department');
            console.error('   Job posting department:', candidate.appliedFor.department);
            throw new Error('Department is required for onboarding');
          }
          
          console.log(`✅ Validation passed. Creating onboarding with:`);
          console.log(`   ApplicationId: ${candidate._id}`);
          console.log(`   JobId: ${candidate.appliedFor._id}`);
          console.log(`   Department: ${candidate.appliedFor.department}`);
          
          const onboardingData = {
            applicationId: candidate._id,
            jobId: candidate.appliedFor._id,
            candidateName: `${candidate.firstName} ${candidate.lastName}`,
            candidateEmail: candidate.email,
            candidatePhone: candidate.phone,
            position: candidate.appliedFor.title || 'Position',
            department: candidate.appliedFor.department,
            status: 'preboarding',
            createdBy: req.user?._id,
            assignedHR: req.user?._id,
            requiredDocuments: [
              { type: 'aadhar', isRequired: true },
              { type: 'pan', isRequired: true },
              { type: 'bank_details', isRequired: true },
              { type: 'address_proof', isRequired: true },
              { type: 'education_certificates', isRequired: true },
              { type: 'photo', isRequired: true }
            ],
            auditTrail: [{
              action: 'auto_created',
              description: 'Automatically created from HR call completion',
              performedBy: req.user?._id,
              previousStatus: candidate.stage,
              newStatus: 'preboarding',
              metadata: { notes: `Auto-created from HR call completion. Decision: Selected` },
              timestamp: new Date()
            }],
            sla: {
              expectedCompletionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            }
          };
          
          const onboarding = await Onboarding.create(onboardingData);
          console.log(`✅ Onboarding record created: ${onboarding._id}`);
          
          // Auto-generate document upload token
          const CandidateDocumentUploadToken = getTenantModel(req.tenant.connection, 'CandidateDocumentUploadToken');
          const { sendOfferLetterWithDocumentLink } = require('../services/emailService');
          
          if (CandidateDocumentUploadToken) {
            try {
              const token = require('crypto').randomBytes(32).toString('hex');
              const expiresAt = new Date();
              expiresAt.setDate(expiresAt.getDate() + 30);

              await CandidateDocumentUploadToken.create({
                onboardingId: onboarding._id,
                candidateId: onboarding.onboardingId,
                candidateName: onboarding.candidateName,
                candidateEmail: onboarding.candidateEmail,
                position: onboarding.position,
                token,
                expiresAt,
                generatedBy: req.user?._id
              });

              const tenantId = req.tenant.companyId || req.tenant.clientId;
              const uploadUrl = `http://3.108.172.119/public/upload-documents/${token}?tenantId=${tenantId}`;
              console.log(`✅ Upload token generated: ${uploadUrl}`);

              // Send offer letter with document upload link
              await sendOfferLetterWithDocumentLink({
                candidateName: onboarding.candidateName,
                candidateEmail: onboarding.candidateEmail,
                position: onboarding.position,
                joiningDate: onboarding.joiningDate,
                uploadUrl,
                companyName: req.tenant?.companyName || companyName
              });
              console.log(`📧 Offer letter with document link sent to ${onboarding.candidateEmail}`);
            } catch (tokenError) {
              console.error('Error generating upload token:', tokenError);
            }
          }
          
          // Link onboarding record to candidate
          candidate.onboardingRecord = onboarding._id;
          candidate.sentToOnboardingAt = new Date();
          candidate.sentToOnboardingBy = req.user?._id;
          
          // Add to timeline
          candidate.timeline.push({
            action: 'Automatically Moved to Onboarding',
            description: `Candidate automatically moved to onboarding after HR call completion with 'selected' decision`,
            performedBy: req.user?._id,
            metadata: { onboardingId: onboarding._id, onboardingStatus: 'preboarding' }
          });
          
          console.log(`✅ Candidate ${candidate.candidateCode} automatically moved to onboarding (ID: ${onboarding.onboardingId})`);
        } catch (onboardingError) {
          console.error('❌ Failed to create onboarding:', onboardingError.message);
          // Don't fail the HR call update if onboarding creation fails
        }
      }
      } catch (autoOnboardingError) {
        console.error('❌ Error in automatic onboarding process:', autoOnboardingError.message);
        // Continue with HR call update even if auto-onboarding fails
      }
    }

    if (normalizedDecision === 'move-to-onboarding') {
      // Legacy support for manual move-to-onboarding decision
      candidate.stage = 'sent-to-onboarding';
      
      try {
        await sendOfferExtendedEmail({
          candidateName,
          candidateEmail: candidate.email,
          position,
          joiningDate: candidate.offerDetails?.joiningDate,
          companyName
        });
        
        candidate.timeline.push({
          action: 'Offer Email Sent',
          description: 'Offer letter email sent to candidate',
          performedBy: req.user?._id
        });
      } catch (emailError) {
        console.error('Failed to send offer email:', emailError);
      }
    } else if (normalizedDecision === 'reject') {
      candidate.stage = 'rejected';
      candidate.status = 'rejected';
      
      // Send rejection email
      try {
        await sendRejectionEmail({
          candidateName,
          candidateEmail: candidate.email,
          position,
          companyName
        });
        
        candidate.timeline.push({
          action: 'Rejection Email Sent',
          description: 'Rejection notification sent to candidate',
          performedBy: req.user?._id
        });
      } catch (emailError) {
        console.error('Failed to send rejection email:', emailError);
      }
    }

    await candidate.save();

    res.status(200).json({
      success: true,
      message: 'HR call updated successfully',
      data: {
        stage: candidate.stage,
        hrCall: candidate.hrCall,
        timeline: candidate.timeline.slice(-1) // Return the latest timeline entry
      }
    });
  } catch (error) {
    console.error('❌ Error in updateHRCall:', error);
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack);
    console.error('   Request body that caused error:', req.body);

    // Provide more specific error messages
    let errorMessage = 'Failed to update HR call';
    if (error.message?.includes('email')) {
      errorMessage = 'HR call updated but email sending failed';
    } else if (error.message?.includes('validation')) {
      errorMessage = 'Invalid data provided for HR call update';
    } else if (error.message?.includes('onboarding')) {
      errorMessage = 'HR call updated but onboarding creation failed';
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get candidate timeline
exports.getCandidateTimeline = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const candidate = await Candidate.findById(req.params.id)
      .populate('timeline.performedBy', 'firstName lastName')
      .populate('interviews.interviewer', 'firstName lastName');

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    res.status(200).json({ 
      success: true, 
      data: {
        timeline: candidate.timeline,
        interviews: candidate.interviews,
        notifications: candidate.notifications,
        hrCall: candidate.hrCall,
        stage: candidate.stage,
        status: candidate.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Check for duplicate candidate
exports.checkDuplicate = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const { email, phone } = req.query;

    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone is required'
      });
    }

    const normalizedEmail = email?.toLowerCase().trim();
    const normalizedPhone = normalizePhone(phone);
    
    const duplicateQuery = {
      $or: []
    };

    if (normalizedEmail) {
      duplicateQuery.$or.push({ email: normalizedEmail });
    }

    if (normalizedPhone) {
      duplicateQuery.$or.push({ phone: normalizedPhone });
      duplicateQuery.$or.push({ alternatePhone: normalizedPhone });
    }

    const existingCandidate = await Candidate.findOne(duplicateQuery)
      .select('candidateCode firstName lastName email phone appliedFor stage status timeline createdAt')
      .populate('appliedFor', 'title')
      .sort({ createdAt: -1 }); // Get most recent

    if (existingCandidate) {
      return res.status(200).json({
        success: true,
        isDuplicate: true,
        data: {
          id: existingCandidate._id,
          candidateCode: existingCandidate.candidateCode,
          name: `${existingCandidate.firstName} ${existingCandidate.lastName}`,
          email: existingCandidate.email,
          phone: existingCandidate.phone,
          currentJob: existingCandidate.appliedFor?.title,
          stage: existingCandidate.stage,
          status: existingCandidate.status,
          applicationCount: existingCandidate.timeline?.length || 0,
          firstApplied: existingCandidate.createdAt
        }
      });
    }

    res.status(200).json({
      success: true,
      isDuplicate: false,
      data: null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get complete candidate history across all applications
exports.getCandidateHistory = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const Offboarding = getTenantModel(req.tenant.connection, 'Offboarding');
    
    const candidate = await Candidate.findById(req.params.id)
      .populate('appliedFor', 'title department')
      .populate('applicationHistory.jobId', 'title department')
      .populate('applicationHistory.onboardingRecord')
      .populate('applicationHistory.offboardingRecord')
      .populate('interviews.interviewer', 'firstName lastName')
      .populate('masterCandidateId');

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    // Get master candidate if this is not the master
    let masterCandidate = candidate;
    if (candidate.masterCandidateId) {
      masterCandidate = await Candidate.findById(candidate.masterCandidateId)
        .populate('appliedFor', 'title department')
        .populate('applicationHistory.jobId', 'title department')
        .populate('interviews.interviewer', 'firstName lastName');
    }

    // Get all linked candidates (all applications)
    const allCandidates = await Candidate.find({
      $or: [
        { _id: masterCandidate._id },
        { masterCandidateId: masterCandidate._id }
      ]
    })
      .populate('appliedFor', 'title department')
      .populate('interviews.interviewer', 'firstName lastName')
      .sort({ createdAt: 1 });

    // Build comprehensive history
    const history = {
      candidate: {
        id: masterCandidate._id,
        candidateCode: masterCandidate.candidateCode,
        name: `${masterCandidate.firstName} ${masterCandidate.lastName}`,
        email: masterCandidate.email,
        phone: masterCandidate.phone
      },
      applications: allCandidates.map(c => ({
        id: c._id,
        jobId: c.appliedFor?._id,
        jobTitle: c.appliedFor?.title,
        appliedDate: c.createdAt,
        stage: c.stage,
        status: c.status,
        interviews: c.interviews || [],
        timeline: c.timeline || []
      })),
      applicationHistory: masterCandidate.applicationHistory || [],
      totalApplications: allCandidates.length,
      onboardingRecords: [],
      offboardingRecords: []
    };

    // Get onboarding records
    const onboardingRecords = await Onboarding.find({
      candidateEmail: masterCandidate.email
    }).sort({ createdAt: -1 });
    history.onboardingRecords = onboardingRecords;

    // Get offboarding records (if employee exists)
    // Note: This would require Employee model lookup first
    // For now, we'll include what we can from applicationHistory

    res.status(200).json({
      success: true,
      data: history
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all applications for a candidate by email
exports.getCandidateByEmail = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find master candidate (first application)
    const masterCandidate = await Candidate.findOne({ email: normalizedEmail })
      .sort({ createdAt: 1 })
      .populate('appliedFor', 'title department');

    if (!masterCandidate) {
      return res.status(404).json({
        success: false,
        message: 'No candidate found with this email'
      });
    }

    // Get all applications
    const allApplications = await Candidate.find({
      $or: [
        { _id: masterCandidate._id },
        { masterCandidateId: masterCandidate._id },
        { email: normalizedEmail }
      ]
    })
      .populate('appliedFor', 'title department')
      .populate('interviews.interviewer', 'firstName lastName')
      .sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      data: {
        masterCandidate: {
          id: masterCandidate._id,
          candidateCode: masterCandidate.candidateCode,
          name: `${masterCandidate.firstName} ${masterCandidate.lastName}`,
          email: masterCandidate.email,
          phone: masterCandidate.phone
        },
        applications: allApplications.map(c => ({
          id: c._id,
          candidateCode: c.candidateCode,
          jobTitle: c.appliedFor?.title,
          appliedDate: c.createdAt,
          stage: c.stage,
          status: c.status,
          interviews: c.interviews || []
        })),
        totalApplications: allApplications.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Send interview notification email to candidate
 * @route POST /api/candidates/:id/send-interview-email
 * @access Private (HR/Admin)
 */
exports.sendInterviewEmail = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const { id } = req.params;
    const { interviewId, companyName } = req.body;

    // Find candidate and populate job details
    const candidate = await Candidate.findById(id)
      .populate('appliedFor', 'title')
      .populate('interviews.interviewer', 'firstName lastName');

    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found'
      });
    }

    // Find the specific interview
    const interview = candidate.interviews.id(interviewId);
    
    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Interview not found'
      });
    }

    // Allow sending interview email regardless of status
    // Removed the requirement that interview must be scheduled first

    // Prepare interviewer name
    const interviewerName = interview.interviewer && interview.interviewer.length > 0
      ? interview.interviewer.map(i => `${i.firstName} ${i.lastName}`).join(', ')
      : null;

    // Send email
    try {
      console.log('📧 Sending interview email to:', candidate.email);
      console.log('📧 Email configuration check - EMAIL_USER:', process.env.EMAIL_USER);
      console.log('📧 Interview details:', {
        interviewType: interview.interviewType,
        scheduledDate: interview.scheduledDate,
        scheduledTime: interview.scheduledTime,
        meetingPlatform: interview.meetingPlatform
      });
      
      const emailResult = await sendInterviewNotification({
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        candidateEmail: candidate.email,
        interviewType: interview.interviewType || 'Interview',
        interviewDate: interview.scheduledDate,
        interviewTime: interview.scheduledTime,
        meetingLink: interview.meetingLink,
        meetingPlatform: interview.meetingPlatform,
        interviewerName: interviewerName,
        position: candidate.appliedFor?.title || 'Position',
        companyName: companyName || 'SPC MANAGMENT'
      });
      
      console.log('✅ Interview email sent successfully. Message ID:', emailResult.messageId);

      // Update notification tracking
      if (!candidate.notifications) {
        candidate.notifications = {};
      }
      if (!candidate.notifications.interviewEmail) {
        candidate.notifications.interviewEmail = {};
      }
      
      candidate.notifications.interviewEmail.sent = true;
      candidate.notifications.interviewEmail.sentAt = new Date();
      candidate.notifications.interviewEmail.sentBy = req.user?._id;

      // Add to timeline
      candidate.timeline.push({
        action: 'Interview Email Sent',
        description: `Interview notification email sent for ${interview.interviewType} interview`,
        performedBy: req.user?._id,
        metadata: { 
          interviewId: interview._id,
          emailSent: true,
          messageId: emailResult.messageId
        }
      });

      await candidate.save();

      res.status(200).json({
        success: true,
        message: 'Interview notification email sent successfully',
        data: {
          emailSent: true,
          recipient: candidate.email,
          messageId: emailResult.messageId,
          interview: {
            type: interview.interviewType,
            date: interview.scheduledDate,
            time: interview.scheduledTime
          }
        }
      });

    } catch (emailError) {
      console.error('❌ Failed to send interview email:', emailError);
      console.error('❌ Email error details:', {
        candidateEmail: candidate.email,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        interviewType: interview.interviewType,
        scheduledDate: interview.scheduledDate,
        error: emailError.message,
        stack: emailError.stack
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to send interview email',
        error: emailError.message
      });
    }

  } catch (error) {
    console.error('Error in sendInterviewEmail:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process interview email request',
      error: error.message
    });
  }
};

/**
 * Upload and parse resume using Reducto API
 * @route POST /api/candidates/upload-resume
 */
exports.uploadResume = async (req, res) => {
  let s3UploadResult = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Resume file is required'
      });
    }

    const file = req.file;
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];

    // Validate file type
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only PDF, DOC, and DOCX files are allowed.'
      });
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 10MB.'
      });
    }

    console.log(`Processing resume upload: ${file.originalname} (${file.size} bytes)`);

    // Step 1: Upload file to AWS S3
    try {
      let filePath, fileName, mimeType;
      
      if (req.file.buffer) {
        // File is in memory (from multer memory storage)
        filePath = req.file.buffer;
        fileName = req.file.originalname;
        mimeType = req.file.mimetype;
        
        // Use uploadFile method for buffer
        s3UploadResult = await awsS3Service.uploadFile(req.file, 'resumes');
      } else {
        // File is on disk (traditional storage)
        filePath = req.file.path;
        fileName = req.file.originalname;
        mimeType = req.file.mimetype;
        
        // Use uploadResume method for file path
        s3UploadResult = await awsS3Service.uploadResume(
          filePath,
          fileName,
          mimeType
        );
      }
      
      console.log('✅ Resume uploaded to S3:', s3UploadResult.key);
    } catch (s3Error) {
      console.error('❌ S3 upload failed:', s3Error);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload resume to storage',
        error: s3Error.message
      });
    }

    // Step 2: Extract candidate data using Reducto
    let extractionResult;
    try {
      let filePathForExtraction;
      
      if (req.file.buffer) {
        // For memory storage, save buffer to temporary file
        const fs = require('fs').promises;
        const os = require('os');
        const path = require('path');
        
        const tempDir = os.tmpdir();
        const tempFileName = `resume-${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`;
        filePathForExtraction = path.join(tempDir, tempFileName);
        
        await fs.writeFile(filePathForExtraction, req.file.buffer);
        console.log('Temporary file created for extraction:', filePathForExtraction);
      } else {
        // Use existing file path
        filePathForExtraction = file.path;
      }
      
      extractionResult = await reductoService.extractCandidateData(filePathForExtraction);
      
      // Clean up temporary file if created
      if (req.file.buffer && filePathForExtraction) {
        try {
          const fs = require('fs').promises;
          await fs.unlink(filePathForExtraction);
          console.log('Temporary file cleaned up');
        } catch (cleanupError) {
          console.warn('Failed to clean up temporary file:', cleanupError);
        }
      }
    } catch (extractError) {
      console.error('Error calling Reducto service:', extractError);

      // If S3 upload succeeded but parsing failed, we still have the file stored
      return res.status(500).json({
        success: false,
        message: 'Resume uploaded to storage but failed to extract data',
        error: extractError.message || 'Unknown error during extraction',
        s3File: {
          key: s3UploadResult.key,
          url: s3UploadResult.url,
          bucket: s3UploadResult.bucket
        }
      });
    }

    if (!extractionResult.success) {
      console.error('Reducto extraction failed:', extractionResult.error);
      console.error('Reducto metadata:', extractionResult.metadata);

      return res.status(500).json({
        success: false,
        message: 'Resume uploaded to storage but failed to extract data',
        error: extractionResult.error || 'Reducto API extraction failed',
        s3File: {
          key: s3UploadResult.key,
          url: s3UploadResult.url,
          bucket: s3UploadResult.bucket
        },
        details: extractionResult.metadata?.responseData || extractionResult.metadata
      });
    }

    // Clean up temporary file
    try {
      const fs = require('fs').promises;
      
      // Only clean up if file exists on disk (not memory storage)
      if (file.path && !req.file.buffer) {
        await fs.unlink(file.path);
        console.log('Temporary file cleaned up');
      }
    } catch (cleanupError) {
      console.warn('Failed to clean up temporary file:', cleanupError);
    }

    res.status(200).json({
      success: true,
      message: 'Resume uploaded to storage and parsed successfully',
      data: {
        extractedData: extractionResult.data,
        rawText: extractionResult.rawText,
        confidence: extractionResult.confidence,
        metadata: extractionResult.metadata,
        s3File: {
          key: s3UploadResult.key,
          url: s3UploadResult.url,
          bucket: s3UploadResult.bucket,
          fileName: s3UploadResult.fileName,
          size: s3UploadResult.size,
          uploadedAt: s3UploadResult.uploadedAt
        }
      }
    });

  } catch (error) {
    console.error('Error in resume upload:', error);

    // Clean up temporary file on error
    if (req.file && req.file.path && !req.file.buffer) {
      try {
        const fs = require('fs').promises;
        await fs.unlink(req.file.path);
        console.log('Temporary file cleaned up after error');
      } catch (cleanupError) {
        console.warn('Failed to clean up temporary file:', cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during resume processing',
      error: error.message
    });
  }
};

/**
 * Auto-populate candidate fields from parsed resume data
 * @param {Object} candidate - Candidate document
 * @param {Object} extractedData - Reducto extracted data
 * @returns {Object} Updated candidate document
 */
const populateCandidateFromResumeData = async (candidate, extractedData) => {
  if (!candidate || !extractedData) {
    return candidate;
  }

  const updates = {};
  let hasUpdates = false;

  // Helper function to check if a field is empty/null/undefined
  const isFieldEmpty = (value) => {
    return value === null || value === undefined ||
           (typeof value === 'string' && value.trim() === '') ||
           (Array.isArray(value) && value.length === 0);
  };

  // Map Reducto fields to candidate fields
  const fieldMappings = {
    // Basic info (only populate if missing)
    firstName: extractedData.firstName,
    lastName: extractedData.lastName,
    email: extractedData.email,
    phone: extractedData.phone,

    // Professional info
    currentCompany: extractedData.currentCompany,
    currentDesignation: extractedData.currentDesignation,
    currentLocation: extractedData.currentLocation,

    // Experience (convert years/months format)
    experience: extractedData.experienceYears !== null && extractedData.experienceYears !== undefined ? {
      years: parseInt(extractedData.experienceYears) || 0,
      months: parseInt(extractedData.experienceMonths) || 0
    } : undefined,

    // Skills (merge with existing if any)
    skills: extractedData.skills,

    // Financial info
    currentCTC: extractedData.currentCTC,
    expectedCTC: extractedData.expectedCTC,
    noticePeriod: extractedData.noticePeriod,

    // Job preferences
    appliedFor: extractedData.appliedFor,
    preferredLocation: extractedData.preferredLocation,

    // Source (if not set)
    source: extractedData.source || 'resume-upload'
  };

  // Apply mappings - only populate empty fields
  Object.entries(fieldMappings).forEach(([field, value]) => {
    if (!isFieldEmpty(value) && isFieldEmpty(candidate[field])) {
      updates[field] = value;
      hasUpdates = true;
      console.log(`📝 Auto-populating ${field}: ${Array.isArray(value) ? value.join(', ') : value}`);
    }
  });

  // Special handling for skills - merge instead of replace
  if (!isFieldEmpty(extractedData.skills) && isFieldEmpty(candidate.skills)) {
    updates.skills = extractedData.skills;
    hasUpdates = true;
    console.log(`📝 Auto-populating skills: ${extractedData.skills.join(', ')}`);
  }

  // Special handling for preferred location - ensure it's an array
  if (!isFieldEmpty(extractedData.preferredLocation) && isFieldEmpty(candidate.preferredLocation)) {
    const preferredLocs = Array.isArray(extractedData.preferredLocation)
      ? extractedData.preferredLocation
      : [extractedData.preferredLocation].filter(Boolean);
    if (preferredLocs.length > 0) {
      updates.preferredLocation = preferredLocs;
      hasUpdates = true;
      console.log(`📝 Auto-populating preferred locations: ${preferredLocs.join(', ')}`);
    }
  }

  // Update candidate if there are changes
  if (hasUpdates) {
    try {
      const updatedCandidate = await candidate.constructor.findByIdAndUpdate(
        candidate._id,
        { $set: updates },
        { new: true, runValidators: false } // Don't run validators to avoid conflicts
      );

      // Log what was populated
      const populatedFields = Object.keys(updates);
      console.log(`🤖 Auto-populated ${populatedFields.length} fields from resume: ${populatedFields.join(', ')}`);

      return updatedCandidate;
    } catch (updateError) {
      console.error('❌ Failed to update candidate with resume data:', updateError.message);
      throw updateError;
    }
  }

  console.log('ℹ️ No fields needed auto-population from resume data');
  return candidate;
};

// Export the function for use in tests
exports.populateCandidateFromResumeData = populateCandidateFromResumeData;

// JD-based Candidate Search and Matching
exports.searchCandidatesByJD = async (req, res) => {
  console.log('🔍 searchCandidatesByJD called with query:', req.query);
  try {
    const { jdId, jdData, minScore = 0, maxResults = 50, filters = {} } = req.query;
    console.log('📋 Parameters:', { jdId, jdData: jdData ? 'present' : 'missing', minScore, maxResults });

    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const JobDescription = getTenantModel(req.tenant.connection, 'JobDescription');

    let jobDescription;

    // If jdId is provided, get JD from database
    if (jdId) {
      jobDescription = await JobDescription.findById(jdId);
      if (!jobDescription) {
        return res.status(404).json({
          success: false,
          error: 'Job description not found'
        });
      }

      if (jobDescription.parsingStatus !== 'completed') {
        return res.status(400).json({
          success: false,
          error: 'Job description parsing not completed yet'
        });
      }
    }
    // If jdData is provided (from frontend form), use it directly
    else if (jdData) {
      try {
        console.log('📄 Processing jdData...');
        // Parse the jdData from query string (URL encoded JSON)
        const parsedJDData = JSON.parse(decodeURIComponent(jdData));
        console.log('✅ JD data parsed successfully:', { jobTitle: parsedJDData.jobTitle, hasParsedData: !!parsedJDData.parsedData });

        // Create a virtual JD object that matches the expected structure
        // The service expects jdData.parsedData to contain the actual parsed data
        jobDescription = {
          jobTitle: parsedJDData.jobTitle,
          companyName: parsedJDData.companyName,
          location: parsedJDData.location,
          employmentType: parsedJDData.employmentType,
          parsedData: parsedJDData.parsedData || parsedJDData, // Ensure the parsedData structure matches service expectations
          // Add other required fields for matching service
          statistics: { lastMatchedAt: new Date() }
        };
        console.log('🏗️ Virtual JD object created:', { jobTitle: jobDescription.jobTitle, parsedDataKeys: Object.keys(jobDescription.parsedData) });
      } catch (parseError) {
        console.error('❌ JD data parsing error:', parseError.message);
        return res.status(400).json({
          success: false,
          error: 'Invalid JD data format',
          details: parseError.message
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either jdId or jdData parameter is required'
      });
    }

    // Perform candidate matching
    const candidateMatchingService = require('../services/candidateMatchingService');
    const matches = await candidateMatchingService.matchCandidates(
      jobDescription,
      req.tenant.connection,
      {
        minScore: parseInt(minScore),
        maxResults: parseInt(maxResults),
        ...filters
      }
    );

    // Populate candidate details
    const populatedMatches = await Promise.all(
      matches.map(async (match) => {
        const candidate = await Candidate.findById(match.candidateId)
          .select('firstName lastName email phone skills experience currentDesignation currentCompany currentLocation preferredLocation status stage');

        return {
          ...match,
          candidate: candidate ? {
            id: candidate._id,
            name: `${candidate.firstName} ${candidate.lastName}`,
            email: candidate.email,
            phone: candidate.phone,
            skills: candidate.skills,
            experience: candidate.experience,
            currentDesignation: candidate.currentDesignation,
            currentCompany: candidate.currentCompany,
            currentLocation: candidate.currentLocation,
            preferredLocation: candidate.preferredLocation,
            status: candidate.status,
            stage: candidate.stage
          } : null
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        jobDescription: {
          id: jobDescription._id,
          jobTitle: jobDescription.jobTitle,
          companyName: jobDescription.companyName
        },
        matches: populatedMatches,
        totalMatches: matches.length,
        searchCriteria: {
          minScore,
          maxResults,
          filters
        }
      }
    });

  } catch (error) {
    console.error('Search candidates by JD error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search candidates by JD',
      details: error.message
    });
  }
};

exports.getCandidatePoolForJD = async (req, res) => {
  try {
    const { jdId } = req.params;
    const { skillMatch = 'any', experienceMatch = 'any', locationMatch = 'any' } = req.query;
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const JobDescription = getTenantModel(req.tenant.connection, 'JobDescription');

    // Get JD details
    const jobDescription = await JobDescription.findById(jdId);
    if (!jobDescription || jobDescription.parsingStatus !== 'completed') {
      return res.status(404).json({
        success: false,
        error: 'Job description not found or not parsed'
      });
    }

    const jdData = jobDescription.parsedData;
    let query = { status: 'active', isActive: true };

    // Apply skill filters
    if (skillMatch === 'required' && jdData.requiredSkills?.length > 0) {
      const requiredSkills = jdData.requiredSkills.map(s => s.skill || s).filter(Boolean);
      query.skills = { $in: requiredSkills };
    }

    // Apply experience filters
    if (experienceMatch === 'exact' && jdData.experienceRequired) {
      const { minYears, maxYears } = jdData.experienceRequired;
      if (minYears !== null && minYears !== undefined) {
        query['experience.years'] = { $gte: minYears };
      }
      if (maxYears !== null && maxYears !== undefined) {
        query['experience.years'] = { ...query['experience.years'], $lte: maxYears };
      }
    }

    // Apply location filters
    if (locationMatch === 'preferred') {
      const locations = [];
      if (jdData.jobLocation) locations.push(jdData.jobLocation);
      if (jdData.preferredLocations?.length) locations.push(...jdData.preferredLocations);

      if (locations.length > 0) {
        query.$or = [
          { currentLocation: { $in: locations } },
          { preferredLocation: { $in: locations } }
        ];
      }
    }

    // Get candidates matching criteria
    const candidates = await Candidate.find(query)
      .select('firstName lastName email phone skills experience currentDesignation currentCompany currentLocation preferredLocation status stage createdAt')
      .sort({ createdAt: -1 })
      .limit(100); // Limit to prevent overwhelming responses

    // Calculate basic match scores for each candidate
    const candidateMatchingService = require('../services/candidateMatchingService');
    const candidatesWithScores = candidates.map(candidate => {
      const matchResult = candidateMatchingService.calculateMatchScore(candidate, jobDescription);
      return {
        candidate: {
          id: candidate._id,
          name: `${candidate.firstName} ${candidate.lastName}`,
          email: candidate.email,
          phone: candidate.phone,
          skills: candidate.skills,
          experience: candidate.experience,
          currentDesignation: candidate.currentDesignation,
          currentCompany: candidate.currentCompany,
          currentLocation: candidate.currentLocation,
          preferredLocation: candidate.preferredLocation,
          status: candidate.status,
          stage: candidate.stage,
          createdAt: candidate.createdAt
        },
        matchScore: matchResult.overallScore,
        overallFit: matchResult.overallFit
      };
    });

    // Sort by match score
    candidatesWithScores.sort((a, b) => b.matchScore - a.matchScore);

    res.status(200).json({
      success: true,
      data: {
        jobDescription: {
          id: jobDescription._id,
          jobTitle: jobDescription.jobTitle,
          parsedData: jdData
        },
        candidatePool: candidatesWithScores,
        totalCandidates: candidatesWithScores.length,
        filters: {
          skillMatch,
          experienceMatch,
          locationMatch
        }
      }
    });

  } catch (error) {
    console.error('Get candidate pool for JD error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get candidate pool for JD',
      details: error.message
    });
  }
};

exports.compareCandidatesForJD = async (req, res) => {
  try {
    const { jdId } = req.params;
    const { candidateIds } = req.body;
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const JobDescription = getTenantModel(req.tenant.connection, 'JobDescription');

    if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Candidate IDs array is required'
      });
    }

    // Get JD details
    const jobDescription = await JobDescription.findById(jdId);
    if (!jobDescription || jobDescription.parsingStatus !== 'completed') {
      return res.status(404).json({
        success: false,
        error: 'Job description not found or not parsed'
      });
    }

    // Get candidates
    const candidates = await Candidate.find({
      _id: { $in: candidateIds },
      status: 'active',
      isActive: true
    }).select('firstName lastName email phone skills experience currentDesignation currentCompany currentLocation preferredLocation status stage');

    // Calculate detailed match scores
    const candidateMatchingService = require('../services/candidateMatchingService');
    const comparisonResults = candidates.map(candidate => {
      const matchResult = candidateMatchingService.calculateMatchScore(candidate, jobDescription);

      return {
        candidate: {
          id: candidate._id,
          name: `${candidate.firstName} ${candidate.lastName}`,
          email: candidate.email,
          phone: candidate.phone,
          skills: candidate.skills,
          experience: candidate.experience,
          currentDesignation: candidate.currentDesignation,
          currentCompany: candidate.currentCompany,
          currentLocation: candidate.currentLocation,
          preferredLocation: candidate.preferredLocation,
          status: candidate.status,
          stage: candidate.stage
        },
        matchDetails: matchResult
      };
    });

    // Sort by overall score
    comparisonResults.sort((a, b) => b.matchDetails.overallScore - a.matchDetails.overallScore);

    res.status(200).json({
      success: true,
      data: {
        jobDescription: {
          id: jobDescription._id,
          jobTitle: jobDescription.jobTitle,
          parsedData: jobDescription.parsedData
        },
        candidateComparison: comparisonResults,
        totalCompared: comparisonResults.length,
        topMatch: comparisonResults[0] || null
      }
    });

  } catch (error) {
    console.error('Compare candidates for JD error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compare candidates for JD',
      details: error.message
    });
  }
};

/**
 * Fix ex-employee candidate names - update candidates with correct names from employee records
 */
exports.fixExEmployeeCandidateNames = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const TenantEmployee = getTenantModel(req.tenant.connection, 'Employee', require('../models/tenant/TenantEmployee'));
    
    // Find all ex-employee candidates
    const exEmployeeCandidates = await Candidate.find({ isExEmployee: true }).lean();
    
    
    let fixedCount = 0;
    let errorCount = 0;
    
    for (const candidate of exEmployeeCandidates) {
      try {
        let employee = null;
        
        // Try to find employee by exEmployeeId first
        if (candidate.exEmployeeId) {
          employee = await TenantEmployee.findById(candidate.exEmployeeId).lean();
        }
        
        // If not found, try by exEmployeeCode
        if (!employee && candidate.exEmployeeCode) {
          employee = await TenantEmployee.findOne({ employeeCode: candidate.exEmployeeCode }).lean();
        }
        
        // If still not found, try by email
        if (!employee && candidate.email) {
          employee = await TenantEmployee.findOne({ email: candidate.email, isExEmployee: true }).lean();
        }
        
        if (employee) {
          const correctFirstName = String(employee.firstName || '').trim();
          const correctLastName = String(employee.lastName || '').trim();
          
          // Check if name needs to be updated
          if (candidate.firstName !== correctFirstName || candidate.lastName !== correctLastName) {
            await Candidate.updateOne(
              { _id: candidate._id },
              { 
                $set: { 
                  firstName: correctFirstName,
                  lastName: correctLastName
                }
              }
            );
            
            
            fixedCount++;
            console.log(`✅ Fixed candidate ${candidate.candidateCode}: "${candidate.firstName} ${candidate.lastName}" -> "${correctFirstName} ${correctLastName}"`);
          }
        } else {
          console.warn(`⚠️  Could not find employee for candidate ${candidate.candidateCode} (exEmployeeCode: ${candidate.exEmployeeCode})`);
        }
      } catch (err) {
        errorCount++;
        console.error(`❌ Error fixing candidate ${candidate.candidateCode}:`, err.message);
      }
    }
    
    
    res.status(200).json({
      success: true,
      message: `Fixed ${fixedCount} candidate name(s)`,
      data: {
        total: exEmployeeCandidates.length,
        fixed: fixedCount,
        errors: errorCount
      }
    });
  } catch (error) {
    console.error('Error fixing ex-employee candidate names:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Move candidate to a different section (Interview, Onboarding, Applicant, Contract, etc.)
 * This is a comprehensive endpoint for moving candidates between different workflow sections
 */
exports.moveCandidateToSection = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    const Onboarding = getTenantModel(req.tenant.connection, 'Onboarding');
    const JobPosting = getTenantModel(req.tenant.connection, 'JobPosting');
    const CandidateDocumentUploadToken = getTenantModel(req.tenant.connection, 'CandidateDocumentUploadToken');
    
    const { id } = req.params;
    const { 
      targetSection, // 'interview', 'onboarding', 'applicant', 'contract', 'shortlisted', 'offer', 'rejected'
      jobPostingId,  // Required for some sections
      reason,
      interviewDetails, // For interview section: { type, scheduledDate, scheduledTime, meetingLink, meetingPlatform }
      contractDetails,  // For contract section: { contractType, startDate, endDate, terms }
      offerDetails      // For offer section: { offeredCTC, offeredDesignation, joiningDate }
    } = req.body;

    if (!targetSection) {
      return res.status(400).json({
        success: false,
        message: 'Target section is required'
      });
    }

    const candidate = await Candidate.findById(id).populate('appliedFor');
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const previousStage = candidate.stage;
    let newStage = previousStage;
    let responseData = { candidate };
    let actionDescription = '';

    // Handle different target sections
    switch (targetSection.toLowerCase()) {
      case 'applicant':
      case 'applied':
        // Move back to applicant pool - requires job posting
        if (!jobPostingId && !candidate.appliedFor) {
          return res.status(400).json({
            success: false,
            message: 'Job posting is required to move candidate to applicant section'
          });
        }
        
        if (jobPostingId) {
          const jobPosting = await JobPosting.findById(jobPostingId);
          if (!jobPosting) {
            return res.status(404).json({ success: false, message: 'Job posting not found' });
          }
          candidate.appliedFor = jobPostingId;
          candidate.appliedForTitle = jobPosting.title;
        }
        
        newStage = 'applied';
        actionDescription = `Moved to applicant pool for ${candidate.appliedForTitle || 'job position'}`;
        break;

      case 'screening':
        newStage = 'screening';
        actionDescription = 'Moved to screening stage';
        break;

      case 'shortlisted':
        // Shortlisting requires job posting selection
        if (!jobPostingId) {
          return res.status(400).json({
            success: false,
            message: 'Job posting selection is required for shortlisting candidates'
          });
        }

        // Validate and get job posting
        const JobPosting = getTenantModel(req.tenant.connection, 'JobPosting');
        const jobPosting = await JobPosting.findById(jobPostingId).populate('department');
        
        if (!jobPosting) {
          return res.status(404).json({
            success: false,
            message: 'Selected job posting not found'
          });
        }

        // Assign job posting to candidate
        candidate.appliedFor = jobPosting._id;
        candidate.appliedForTitle = jobPosting.title;
        candidate.department = jobPosting.department?._id;
        
        newStage = 'shortlisted';
        actionDescription = `Candidate shortlisted for ${jobPosting.title}`;
        
        console.log(`📋 Candidate ${candidate.firstName} ${candidate.lastName} shortlisted for job: ${jobPosting.title}`);
        
        // Send shortlisted email with job details
        try {
          await sendShortlistedEmail({
            candidateName: `${candidate.firstName} ${candidate.lastName}`,
            candidateEmail: candidate.email,
            position: jobPosting.title,
            jobDescription: jobPosting.description,
            department: jobPosting.department?.name,
            location: jobPosting.location,
            employmentType: jobPosting.employmentType,
            companyName: req.body.companyName || 'Our Company'
          });
          console.log(`✅ Shortlisted email sent to ${candidate.email} for ${jobPosting.title}`);
        } catch (emailError) {
          console.error('Failed to send shortlisted email:', emailError.message);
        }
        
        responseData.jobPosting = {
          id: jobPosting._id,
          title: jobPosting.title,
          department: jobPosting.department?.name,
          location: jobPosting.location,
          employmentType: jobPosting.employmentType
        };
        break;

      case 'interview':
      case 'interview-scheduled':
        // Schedule interview - requires interview details
        if (!interviewDetails) {
          return res.status(400).json({
            success: false,
            message: 'Interview details are required (type, scheduledDate, scheduledTime)'
          });
        }

        const interviewData = {
          interviewType: interviewDetails.type || 'Technical',
          round: interviewDetails.round || 'Round 1',
          scheduledDate: interviewDetails.scheduledDate,
          scheduledTime: interviewDetails.scheduledTime,
          meetingLink: interviewDetails.meetingLink || '',
          meetingPlatform: interviewDetails.meetingPlatform || 'Google Meet',
          interviewer: interviewDetails.interviewer ? [interviewDetails.interviewer] : [],
          status: 'scheduled'
        };

        candidate.interviews.push(interviewData);
        newStage = 'interview-scheduled';
        actionDescription = `${interviewDetails.type || 'Technical'} interview scheduled for ${new Date(interviewDetails.scheduledDate).toLocaleDateString()}`;

        // Send interview notification email
        try {
          await sendInterviewNotification({
            candidateName: `${candidate.firstName} ${candidate.lastName}`,
            candidateEmail: candidate.email,
            interviewType: interviewDetails.type || 'Technical',
            interviewDate: interviewDetails.scheduledDate,
            interviewTime: interviewDetails.scheduledTime,
            meetingLink: interviewDetails.meetingLink,
            meetingPlatform: interviewDetails.meetingPlatform || 'Google Meet',
            position: candidate.appliedFor?.title || candidate.appliedForTitle || 'Position',
            companyName: req.body.companyName || 'Our Company'
          });
        } catch (emailError) {
          console.error('Failed to send interview notification:', emailError.message);
        }
        break;

      case 'offer':
      case 'offer-extended':
        // Extend offer - requires offer details
        if (offerDetails) {
          candidate.offerDetails = {
            ...candidate.offerDetails,
            offeredCTC: offerDetails.offeredCTC || candidate.offerDetails?.offeredCTC,
            offeredDesignation: offerDetails.offeredDesignation || candidate.offerDetails?.offeredDesignation,
            joiningDate: offerDetails.joiningDate || candidate.offerDetails?.joiningDate,
            offerExtendedDate: new Date()
          };
        }
        
        newStage = 'offer-extended';
        actionDescription = 'Offer extended to candidate';

        // Send offer email
        try {
          await sendOfferExtendedEmail({
            candidateName: `${candidate.firstName} ${candidate.lastName}`,
            candidateEmail: candidate.email,
            position: candidate.appliedFor?.title || candidate.appliedForTitle || 'Position',
            joiningDate: candidate.offerDetails?.joiningDate,
            companyName: req.body.companyName || 'Our Company'
          });
        } catch (emailError) {
          console.error('Failed to send offer email:', emailError.message);
        }
        break;

      case 'offer-accepted':
        newStage = 'offer-accepted';
        if (candidate.offerDetails) {
          candidate.offerDetails.offerAcceptedDate = new Date();
        }
        actionDescription = 'Candidate accepted the offer';
        break;

      case 'onboarding':
      case 'sent-to-onboarding':
        console.log('🔄 Moving candidate to onboarding...');
        console.log('   Candidate appliedFor:', candidate.appliedFor);
        console.log('   Job posting ID from request:', jobPostingId);
        
        // Move to onboarding - requires job posting with department
        if (!candidate.appliedFor && !jobPostingId) {
          console.error('❌ No job posting found for candidate');
          return res.status(400).json({
            success: false,
            message: 'Job posting is required to move candidate to onboarding. Please select a job posting.'
          });
        }

        // If jobPostingId provided, update the candidate's appliedFor
        if (jobPostingId && jobPostingId !== candidate.appliedFor?._id?.toString()) {
          console.log('📝 Updating candidate with new job posting:', jobPostingId);
          const jobPosting = await JobPosting.findById(jobPostingId).populate('department');
          if (!jobPosting) {
            console.error('❌ Job posting not found:', jobPostingId);
            return res.status(404).json({ success: false, message: 'Job posting not found' });
          }
          console.log('   Job posting found:', jobPosting.title);
          console.log('   Department:', jobPosting.department);
          
          if (!jobPosting.department) {
            console.error('❌ Job posting has no department');
            return res.status(400).json({ 
              success: false, 
              message: `Job posting "${jobPosting.title}" must have a department assigned for onboarding. Please update the job posting first.` 
            });
          }
          candidate.appliedFor = jobPostingId;
          candidate.appliedForTitle = jobPosting.title;
        }

        // Ensure we have the populated appliedFor
        await candidate.populate('appliedFor');
        console.log('   Populated appliedFor:', candidate.appliedFor?.title);
        console.log('   Department:', candidate.appliedFor?.department);
        
        if (!candidate.appliedFor?.department) {
          console.error('❌ Job posting has no department after population');
          return res.status(400).json({
            success: false,
            message: `The job posting "${candidate.appliedFor?.title || 'Unknown'}" must have a department assigned for onboarding. Please update the job posting to include a department.`
          });
        }
        
        console.log('✅ Validation passed, proceeding with onboarding creation...');

        // Check for existing onboarding
        let existingOnboarding = await Onboarding.findOne({ candidateEmail: candidate.email });
        let onboarding;

        if (existingOnboarding && existingOnboarding.status !== 'completed') {
          // Update existing onboarding
          existingOnboarding.applicationId = candidate._id;
          existingOnboarding.jobId = candidate.appliedFor._id;
          existingOnboarding.candidateName = `${candidate.firstName} ${candidate.lastName}`;
          existingOnboarding.candidatePhone = candidate.phone;
          existingOnboarding.position = candidate.appliedFor.title || 'Position';
          existingOnboarding.department = candidate.appliedFor.department;
          existingOnboarding.joiningDate = candidate.offerDetails?.joiningDate;
          existingOnboarding.status = 'preboarding';
          await existingOnboarding.save();
          onboarding = existingOnboarding;
        } else {
          // Create new onboarding
          onboarding = await Onboarding.create({
            applicationId: candidate._id,
            jobId: candidate.appliedFor._id,
            candidateName: `${candidate.firstName} ${candidate.lastName}`,
            candidateEmail: candidate.email,
            candidatePhone: candidate.phone,
            position: candidate.appliedFor.title || 'Position',
            department: candidate.appliedFor.department,
            joiningDate: candidate.offerDetails?.joiningDate,
            status: 'preboarding',
            createdBy: req.user?._id,
            assignedHR: req.user?._id,
            requiredDocuments: [
              { type: 'aadhar', isRequired: true },
              { type: 'pan', isRequired: true },
              { type: 'bank_details', isRequired: true },
              { type: 'address_proof', isRequired: true },
              { type: 'education_certificates', isRequired: true },
              { type: 'photo', isRequired: true }
            ],
            auditTrail: [{
              action: 'moved_to_onboarding',
              description: reason || 'Candidate moved to onboarding',
              performedBy: req.user?._id,
              previousStatus: previousStage,
              newStatus: 'preboarding',
              timestamp: new Date()
            }]
          });
        }

        // Generate document upload token
        if (CandidateDocumentUploadToken) {
          try {
            const token = require('crypto').randomBytes(32).toString('hex');
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);

            await CandidateDocumentUploadToken.create({
              onboardingId: onboarding._id,
              candidateName: onboarding.candidateName,
              candidateEmail: onboarding.candidateEmail,
              position: onboarding.position,
              token,
              expiresAt,
              generatedBy: req.user?._id
            });

            const tenantId = req.tenant.companyId || req.tenant.clientId;
            const uploadUrl = `http://3.108.172.119/public/upload-documents/${token}?tenantId=${tenantId}`;
            responseData.uploadUrl = uploadUrl;

            // Send offer letter with document link
            const { sendOfferLetterWithDocumentLink } = require('../services/emailService');
            await sendOfferLetterWithDocumentLink({
              candidateName: onboarding.candidateName,
              candidateEmail: onboarding.candidateEmail,
              position: onboarding.position,
              joiningDate: onboarding.joiningDate,
              uploadUrl,
              companyName: req.tenant?.companyName || 'Our Company'
            });
          } catch (tokenError) {
            console.error('Error generating upload token:', tokenError.message);
          }
        }

        candidate.onboardingRecord = onboarding._id;
        candidate.sentToOnboardingAt = new Date();
        candidate.sentToOnboardingBy = req.user?._id;
        newStage = 'sent-to-onboarding';
        actionDescription = 'Candidate moved to onboarding';
        responseData.onboarding = onboarding;
        break;

      case 'contract':
        // Move to contract stage
        if (contractDetails) {
          candidate.contractDetails = {
            contractType: contractDetails.contractType || candidate.employmentType,
            startDate: contractDetails.startDate,
            endDate: contractDetails.endDate,
            terms: contractDetails.terms
          };
        }
        
        // For contract-based employment, update employment type
        if (contractDetails?.contractType) {
          candidate.employmentType = contractDetails.contractType;
        }
        
        newStage = 'offer-extended';
        actionDescription = `Contract prepared for candidate (${contractDetails?.contractType || candidate.employmentType})`;
        break;

      case 'rejected':
        newStage = 'rejected';
        candidate.status = 'rejected';
        candidate.rejectionReason = reason || 'Not selected';
        actionDescription = reason || 'Candidate rejected';

        // Send rejection email
        try {
          await sendRejectionEmail({
            candidateName: `${candidate.firstName} ${candidate.lastName}`,
            candidateEmail: candidate.email,
            position: candidate.appliedFor?.title || candidate.appliedForTitle || 'Position',
            companyName: req.body.companyName || 'Our Company'
          });
        } catch (emailError) {
          console.error('Failed to send rejection email:', emailError.message);
        }
        break;

      default:
        return res.status(400).json({
          success: false,
          message: `Invalid target section: ${targetSection}. Valid sections are: applicant, screening, shortlisted, interview, offer, offer-accepted, onboarding, contract, rejected`
        });
    }

    // Update candidate stage
    candidate.stage = newStage;

    // Add to workflow history
    candidate.workflowHistory = candidate.workflowHistory || [];
    candidate.workflowHistory.push({
      fromStage: previousStage,
      toStage: newStage,
      skippedStages: [],
      movedBy: req.user?._id,
      reason: reason || actionDescription,
      timestamp: new Date()
    });

    // Add to timeline
    candidate.timeline = candidate.timeline || [];
    candidate.timeline.push({
      action: `Moved to ${targetSection}`,
      description: actionDescription,
      performedBy: req.user?._id,
      metadata: { 
        targetSection, 
        previousStage, 
        newStage,
        jobPostingId: jobPostingId || candidate.appliedFor?._id
      },
      timestamp: new Date()
    });

    await candidate.save();

    res.status(200).json({
      success: true,
      message: actionDescription,
      data: {
        candidate: {
          _id: candidate._id,
          candidateCode: candidate.candidateCode,
          name: `${candidate.firstName} ${candidate.lastName}`,
          email: candidate.email,
          previousStage,
          currentStage: newStage,
          appliedFor: candidate.appliedFor?.title || candidate.appliedForTitle
        },
        ...responseData
      }
    });
  } catch (error) {
    console.error('Error in moveCandidateToSection:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to move candidate to section'
    });
  }
};

/**
 * Get available job postings for candidate movement
 */
exports.getJobPostingsForCandidateMove = async (req, res) => {
  try {
    console.log('🔍 Fetching job postings for candidate move...');
    console.log('   Tenant:', req.tenant?.companyId || req.tenant?.clientId);
    
    const JobPosting = getTenantModel(req.tenant.connection, 'JobPosting');
    
    if (!JobPosting) {
      console.error('❌ JobPosting model not found');
      return res.status(500).json({
        success: false,
        message: 'JobPosting model not available'
      });
    }

    // First, check total job postings
    const totalJobPostings = await JobPosting.countDocuments();
    console.log(`📊 Total job postings in database: ${totalJobPostings}`);

    // Check job postings by status
    const statusCounts = await JobPosting.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    console.log('📈 Job postings by status:', statusCounts);

    const jobPostings = await JobPosting.find({ 
      status: { $in: ['open', 'active', 'published'] }
    })
    .populate('department', 'name code')
    .select('title department location employmentType status createdAt')
    .sort({ createdAt: -1 })
    .limit(100);

    console.log(`🎯 Found ${jobPostings.length} active job postings`);

    const formattedJobPostings = jobPostings.map(jp => ({
      _id: jp._id,
      title: jp.title,
      department: jp.department?.name || 'No Department',
      departmentId: jp.department?._id,
      location: jp.location,
      employmentType: jp.employmentType,
      status: jp.status
    }));

    console.log(`✅ Found ${formattedJobPostings.length} job postings for candidate move`);

    // If no active job postings found, try to find any job postings with different statuses
    if (formattedJobPostings.length === 0) {
      console.log('⚠️ No active job postings found, checking all job postings...');
      const allJobPostings = await JobPosting.find({})
        .populate('department', 'name code')
        .select('title department location employmentType status createdAt')
        .sort({ createdAt: -1 })
        .limit(10);
      
      console.log('📋 Sample job postings with any status:');
      allJobPostings.forEach(jp => {
        console.log(`   - ${jp.title} (Status: ${jp.status})`);
      });
    }

    res.status(200).json({
      success: true,
      count: formattedJobPostings.length,
      jobPostings: formattedJobPostings,
      data: formattedJobPostings,
      debug: {
        totalJobPostings,
        statusCounts,
        searchedStatuses: ['open', 'active', 'published']
      }
    });
  } catch (error) {
    console.error('❌ Error fetching job postings for candidate move:', error);
    console.error('   Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message,
      error: error.stack
    });
  }
};

/**
 * Clean up duplicate ex-employee candidates - keep only the most recent one per ex-employee
 */
exports.cleanupDuplicateExEmployeeCandidates = async (req, res) => {
  try {
    const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
    
    // Find all ex-employee candidates grouped by exEmployeeCode
    const exEmployeeCandidates = await Candidate.find({ isExEmployee: true })
      .sort({ createdAt: -1 })
      .lean();
    
    
    // Group by exEmployeeCode or exEmployeeId
    const grouped = {};
    const toDelete = [];
    
    for (const candidate of exEmployeeCandidates) {
      const key = candidate.exEmployeeCode || candidate.exEmployeeId?.toString() || candidate.email;
      if (!key) continue;
      
      if (!grouped[key]) {
        grouped[key] = [candidate];
      } else {
        grouped[key].push(candidate);
      }
    }
    
    // For each group, keep the most recent (first in sorted list) and mark others for deletion
    for (const [key, candidates] of Object.entries(grouped)) {
      if (candidates.length > 1) {
        // Keep the first one (most recent), delete the rest
        const toKeep = candidates[0];
        const duplicates = candidates.slice(1);
        
        
        toDelete.push(...duplicates.map(c => c._id));
      }
    }
    
    if (toDelete.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No duplicate candidates found',
        data: { deleted: 0 }
      });
    }
    
    // Delete duplicates
    const deleteResult = await Candidate.deleteMany({ _id: { $in: toDelete } });
    
    
    res.status(200).json({
      success: true,
      message: `Cleaned up ${deleteResult.deletedCount} duplicate candidate(s)`,
      data: {
        deleted: deleteResult.deletedCount
      }
    });
  } catch (error) {
    console.error('Error cleaning up duplicate candidates:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
