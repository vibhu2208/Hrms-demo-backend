const ResumePool = require('../models/ResumePool');
const resumeParser = require('../utils/resumeParser');
const aiService = require('../services/aiService');
const { getTenantModel } = require('../utils/tenantModels');

/**
 * Upload raw resume text to pool
 */
exports.uploadResumeText = async (req, res) => {
  try {
    const TenantResumePool = getTenantModel(req.tenant.connection, 'ResumePool');
    
    const {
      name,
      email,
      phone,
      rawText,
      fileName,
      tags,
      notes
    } = req.body;

    if (!name || !rawText) {
      return res.status(400).json({
        success: false,
        message: 'Name and raw text are required'
      });
    }

    // Create resume pool entry
    const resumeEntry = new TenantResumePool({
      name,
      email,
      phone,
      rawText,
      fileName: fileName || 'Manual Entry',
      fileType: 'text',
      source: 'upload',
      uploadedBy: req.user.id,
      tags: tags || [],
      notes: notes || '',
      processingStatus: 'pending'
    });

    await resumeEntry.save();

    // Start async processing
    setImmediate(() => processResumeEntry(resumeEntry, TenantResumePool));

    res.status(201).json({
      success: true,
      message: 'Resume uploaded successfully and processing started',
      data: {
        id: resumeEntry._id,
        name: resumeEntry.name,
        processingStatus: resumeEntry.processingStatus
      }
    });

  } catch (error) {
    console.error('Error uploading resume text:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload resume',
      error: error.message
    });
  }
};

/**
 * Upload multiple resume texts (batch upload)
 */
exports.uploadBatchResumes = async (req, res) => {
  try {
    const TenantResumePool = getTenantModel(req.tenant.connection, 'ResumePool');
    const { resumes } = req.body;

    if (!Array.isArray(resumes) || resumes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Resumes array is required'
      });
    }

    const results = [];
    
    for (const resumeData of resumes) {
      try {
        const resumeEntry = new TenantResumePool({
          name: resumeData.name,
          email: resumeData.email,
          phone: resumeData.phone,
          rawText: resumeData.rawText,
          fileName: resumeData.fileName || 'Batch Upload',
          fileType: 'text',
          source: 'upload',
          uploadedBy: req.user.id,
          tags: resumeData.tags || [],
          notes: resumeData.notes || '',
          processingStatus: 'pending'
        });

        await resumeEntry.save();
        
        // Start async processing
        setImmediate(() => processResumeEntry(resumeEntry, TenantResumePool));
        
        results.push({
          success: true,
          id: resumeEntry._id,
          name: resumeEntry.name
        });
      } catch (error) {
        results.push({
          success: false,
          name: resumeData.name,
          error: error.message
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `Processed ${results.length} resumes`,
      data: results
    });

  } catch (error) {
    console.error('Error in batch upload:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process batch upload',
      error: error.message
    });
  }
};

/**
 * Parse resume from file upload
 */
exports.uploadResumeFile = async (req, res) => {
  try {
    const TenantResumePool = getTenantModel(req.tenant.connection, 'ResumePool');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { name, email, phone, tags, notes } = req.body;
    const file = req.file;

    // Parse the resume file
    const parsedData = await resumeParser.parseResume(file.path);
    
    // Create resume pool entry
    const resumeEntry = new TenantResumePool({
      name: name || extractNameFromText(parsedData.rawText),
      email,
      phone,
      rawText: parsedData.rawText,
      fileName: file.originalname,
      fileType: file.mimetype.includes('pdf') ? 'pdf' : 'docx',
      source: 'upload',
      uploadedBy: req.user.id,
      tags: tags || [],
      notes: notes || '',
      processingStatus: 'processing'
    });

    // Update with parsed data
    resumeEntry.parsedData = {
      skills: parsedData.skills || [],
      experience: {
        years: parsedData.experience || 0,
        months: 0
      },
      education: parsedData.education || [],
      currentCompany: parsedData.currentCompany || '',
      currentDesignation: parsedData.currentDesignation || '',
      location: parsedData.location || '',
      previousRoles: parsedData.previousRoles || [],
      certifications: parsedData.certifications || [],
      languages: parsedData.languages || []
    };

    await resumeEntry.save();

    // Start AI analysis
    setImmediate(() => analyzeResumeEntry(resumeEntry, TenantResumePool));

    res.status(201).json({
      success: true,
      message: 'Resume file uploaded and processed successfully',
      data: {
        id: resumeEntry._id,
        name: resumeEntry.name,
        processingStatus: resumeEntry.processingStatus,
        parsedSkills: resumeEntry.parsedData.skills.length,
        extractedExperience: resumeEntry.parsedData.experience.years
      }
    });

  } catch (error) {
    console.error('Error uploading resume file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload resume file',
      error: error.message
    });
  }
};

/**
 * Get all resumes in pool
 */
exports.getResumePool = async (req, res) => {
  try {
    const TenantResumePool = getTenantModel(req.tenant.connection, 'ResumePool');
    
    const {
      page = 1,
      limit = 20,
      status = 'active',
      processingStatus,
      search,
      skills,
      minExperience,
      maxExperience,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    let query = { status };
    
    if (processingStatus) {
      query.processingStatus = processingStatus;
    }
    
    if (search) {
      query.$text = { $search: search };
    }
    
    if (skills) {
      const skillArray = Array.isArray(skills) ? skills : skills.split(',');
      query['parsedData.skills'] = { $in: skillArray };
    }
    
    if (minExperience || maxExperience) {
      query['parsedData.experience.years'] = {};
      if (minExperience) query['parsedData.experience.years'].$gte = parseInt(minExperience);
      if (maxExperience) query['parsedData.experience.years'].$lte = parseInt(maxExperience);
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query
    const resumes = await TenantResumePool.find(query)
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('name email phone fileName processingStatus parsedData aiAnalysis tags createdAt');

    const total = await TenantResumePool.countDocuments(query);

    res.status(200).json({
      success: true,
      data: resumes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error getting resume pool:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve resume pool',
      error: error.message
    });
  }
};

/**
 * Get single resume by ID
 */
exports.getResumeById = async (req, res) => {
  try {
    const TenantResumePool = getTenantModel(req.tenant.connection, 'ResumePool');
    
    const resume = await TenantResumePool.findById(req.params.id);
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    res.status(200).json({
      success: true,
      data: resume
    });

  } catch (error) {
    console.error('Error getting resume:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve resume',
      error: error.message
    });
  }
};

/**
 * Update resume
 */
exports.updateResume = async (req, res) => {
  try {
    const TenantResumePool = getTenantModel(req.tenant.connection, 'ResumePool');
    
    const {
      name,
      email,
      phone,
      tags,
      notes,
      status
    } = req.body;

    const resume = await TenantResumePool.findById(req.params.id);
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    // Update fields
    if (name) resume.name = name;
    if (email) resume.email = email;
    if (phone) resume.phone = phone;
    if (tags) resume.tags = tags;
    if (notes) resume.notes = notes;
    if (status) resume.status = status;

    await resume.save();

    res.status(200).json({
      success: true,
      message: 'Resume updated successfully',
      data: resume
    });

  } catch (error) {
    console.error('Error updating resume:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update resume',
      error: error.message
    });
  }
};

/**
 * Delete resume
 */
exports.deleteResume = async (req, res) => {
  try {
    const TenantResumePool = getTenantModel(req.tenant.connection, 'ResumePool');
    
    const resume = await TenantResumePool.findById(req.params.id);
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    await TenantResumePool.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Resume deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting resume:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete resume',
      error: error.message
    });
  }
};

/**
 * Get processing statistics
 */
exports.getProcessingStats = async (req, res) => {
  try {
    const TenantResumePool = getTenantModel(req.tenant.connection, 'ResumePool');
    
    const stats = await TenantResumePool.getProcessingStats();
    
    const totalResumes = await TenantResumePool.countDocuments();
    const activeResumes = await TenantResumePool.countDocuments({ status: 'active' });
    
    res.status(200).json({
      success: true,
      data: {
        total: totalResumes,
        active: activeResumes,
        processing: stats
      }
    });

  } catch (error) {
    console.error('Error getting processing stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve processing stats',
      error: error.message
    });
  }
};

/**
 * Search resumes in pool - AI-powered intelligent search
 */
exports.searchResumes = async (req, res) => {
  try {
    const TenantResumePool = getTenantModel(req.tenant.connection, 'ResumePool');
    const intelligentSearch = require('../services/intelligentSearchService').intelligentSearch;
    
    const {
      query,
      page = 1,
      limit = 20,
      filters = {},
      // CTC filters
      currentCTCMin,
      currentCTCMax,
      expectedCTCMin,
      expectedCTCMax,
      // Geolocation filters
      currentLocation,
      preferredLocation
    } = req.body;

    // Build base query filters
    const baseQuery = {
      status: 'active',
      processingStatus: 'completed', // Only search completed resumes
      ...filters
    };

    // Add CTC filters
    if (currentCTCMin !== undefined || currentCTCMax !== undefined) {
      baseQuery.currentCTC = {};
      if (currentCTCMin !== undefined) baseQuery.currentCTC.$gte = Number(currentCTCMin);
      if (currentCTCMax !== undefined) baseQuery.currentCTC.$lte = Number(currentCTCMax);
    }

    if (expectedCTCMin !== undefined || expectedCTCMax !== undefined) {
      baseQuery.expectedCTC = {};
      if (expectedCTCMin !== undefined) baseQuery.expectedCTC.$gte = Number(expectedCTCMin);
      if (expectedCTCMax !== undefined) baseQuery.expectedCTC.$lte = Number(expectedCTCMax);
    }

    // Add geolocation filters
    if (currentLocation) {
      if (Array.isArray(currentLocation)) {
        baseQuery.currentLocation = { $in: currentLocation.map(loc => new RegExp(loc, 'i')) };
      } else {
        baseQuery.currentLocation = { $regex: currentLocation, $options: 'i' };
      }
    }

    if (preferredLocation) {
      if (Array.isArray(preferredLocation)) {
        const locationQueries = preferredLocation.map(loc => ({
          preferredLocation: { $regex: loc, $options: 'i' }
        }));
        if (baseQuery.$or) {
          baseQuery.$or = [...baseQuery.$or, ...locationQueries];
        } else {
          baseQuery.$or = locationQueries;
        }
      } else {
        baseQuery.preferredLocation = { $regex: preferredLocation, $options: 'i' };
      }
    }

    // Fetch all matching resumes (we'll apply intelligent search on the full set)
    // Limit to reasonable number to avoid memory issues (e.g., 500)
    const maxFetch = Math.max(limit * 5, 500);
    const allResumes = await TenantResumePool.find(baseQuery)
      .limit(maxFetch)
      .select('name email phone parsedData aiAnalysis tags createdAt currentCTC expectedCTC currentLocation preferredLocation rawText searchableText');

    // Apply intelligent search if query provided
    let searchResults;
    if (query && query.trim()) {
      searchResults = intelligentSearch(allResumes, query.trim());
    } else {
      // No query - return all with default scores, sorted by relevance (newest first)
      searchResults = allResumes.map(resume => ({
        candidateId: resume._id.toString(),
        name: resume.name || 'Unnamed Candidate',
        email: resume.email || '',
        phone: resume.phone || '',
        relevanceScore: 50,
        matchedSkills: [],
        experienceYears: resume.parsedData?.experience?.years || 0,
        experienceMonths: resume.parsedData?.experience?.months || 0,
        reason: 'No search query - showing all candidates',
        resume: resume
      }));
      
      // Sort by date if no query
      searchResults.sort((a, b) => {
        const dateA = new Date(a.resume.createdAt || 0).getTime();
        const dateB = new Date(b.resume.createdAt || 0).getTime();
        return dateB - dateA;
      });
    }

    // Apply pagination
    const total = searchResults.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedResults = searchResults.slice(startIndex, endIndex);

    // Format results - extract resume data and add scoring info
    const formattedResults = paginatedResults.map(result => ({
      _id: result.candidateId,
      name: result.name,
      email: result.email,
      phone: result.phone,
      parsedData: result.resume?.parsedData || result.resume?.parsedData || {},
      aiAnalysis: result.resume?.aiAnalysis || null,
      tags: result.resume?.tags || [],
      createdAt: result.resume?.createdAt || new Date(),
      currentCTC: result.resume?.currentCTC || null,
      expectedCTC: result.resume?.expectedCTC || null,
      currentLocation: result.resume?.currentLocation || null,
      preferredLocation: result.resume?.preferredLocation || null,
      // Add intelligent search metadata
      relevanceScore: result.relevanceScore,
      matchedSkills: result.matchedSkills,
      matchReason: result.reason,
      experienceYears: result.experienceYears,
      experienceMonths: result.experienceMonths || 0
    }));

    res.status(200).json({
      success: true,
      query: query || '',
      data: formattedResults,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      searchMetadata: {
        totalResults: total,
        searchType: query ? 'intelligent' : 'all',
        hasResults: total > 0
      }
    });

  } catch (error) {
    console.error('Error searching resumes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search resumes',
      error: error.message
    });
  }
};

/**
 * Helper function to process resume entry
 */
async function processResumeEntry(resumeEntry, TenantResumePool) {
  try {
    resumeEntry.processingStatus = 'processing';
    await resumeEntry.save();

    // Parse the resume text
    const parsedData = await resumeParser.parseText(resumeEntry.rawText);
    
    await resumeEntry.updateParsedData(parsedData);
    
    // Start AI analysis
    await analyzeResumeEntry(resumeEntry, TenantResumePool);
    
  } catch (error) {
    console.error('Error processing resume entry:', error);
    await resumeEntry.markAsFailed(error.message);
  }
}

/**
 * Helper function to analyze resume entry
 */
async function analyzeResumeEntry(resumeEntry, TenantResumePool) {
  try {
    // Create a mock job posting for analysis
    const mockJobPosting = {
      title: 'Software Engineer',
      description: 'Looking for experienced software engineer',
      skills: resumeEntry.parsedData.skills || [],
      experience: { min: 0, max: 20 }
    };

    // Create mock candidate object
    const mockCandidate = {
      firstName: resumeEntry.name.split(' ')[0] || '',
      lastName: resumeEntry.name.split(' ')[1] || '',
      skills: resumeEntry.parsedData.skills || [],
      experience: resumeEntry.parsedData.experience || { years: 0, months: 0 },
      currentDesignation: resumeEntry.parsedData.currentDesignation || '',
      education: resumeEntry.parsedData.education || []
    };

    // Get AI analysis
    const skillsMatch = aiService.calculateSkillsMatch(mockJobPosting.skills, mockCandidate.skills);
    const experienceMatch = aiService.calculateExperienceMatch(mockJobPosting.experience, mockCandidate.experience);
    const aiAnalysis = await aiService.generateAIInsights(mockJobPosting, mockCandidate, skillsMatch, experienceMatch);

    await resumeEntry.updateAIAnalysis(aiAnalysis);
    
  } catch (error) {
    console.error('Error analyzing resume entry:', error);
    // Don't mark as failed, just log the error
  }
}

/**
 * Helper function to extract name from text
 */
function extractNameFromText(text) {
  const lines = text.split('\n').slice(0, 5);
  for (const line of lines) {
    const cleanLine = line.trim();
    if (cleanLine.length > 3 && cleanLine.length < 50 && /^[A-Za-z\s]+$/.test(cleanLine)) {
      return cleanLine;
    }
  }
  return 'Unknown Candidate';
}

module.exports = exports;
