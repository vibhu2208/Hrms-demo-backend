const { getTenantModel } = require('../utils/tenantModels');
const jdParserService = require('../services/jdParserService');
const candidateMatchingService = require('../services/candidateMatchingService');
const awsS3Service = require('../services/awsS3Service');
const fs = require('fs');
const path = require('path');

exports.uploadAndParseJD = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const { jobPostingId, jobTitle, companyName } = req.body;
    const JobDescription = getTenantModel(req.tenant.connection, 'JobDescription');
    const JobPosting = getTenantModel(req.tenant.connection, 'JobPosting');

    // Upload file to S3
    const s3Result = await awsS3Service.uploadFile(req.file, 'jd-documents');
    if (!s3Result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to upload file to storage'
      });
    }

    // Create JobDescription document
    const jobDescription = new JobDescription({
      jobTitle: jobTitle || 'Untitled Position',
      companyName: companyName,
      originalFile: {
        url: s3Result.url,
        filename: req.file.originalname,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        uploadedAt: new Date(),
        s3Key: s3Result.key,
        s3Bucket: s3Result.bucket,
        signedUrl: s3Result.signedUrl
      },
      uploadedBy: req.user.id,
      parsingStatus: 'processing'
    });

    await jobDescription.save();

    // Link with JobPosting if provided
    if (jobPostingId) {
      const jobPosting = await JobPosting.findById(jobPostingId);
      if (jobPosting) {
        jobPosting.jobDescription = jobDescription._id;
        jobPosting.jdParsingStatus = 'processing';
        await jobPosting.save();
        jobDescription.jobPostingId = jobPostingId;
        await jobDescription.save();
      }
    }

    // Start parsing in background
    console.log(`📤 Queuing JD for parsing - ID: ${jobDescription._id}, File: ${req.file.path}`);
    console.log(`📂 File exists: ${fs.existsSync(req.file.path)}`);
    console.log(`📏 File size: ${req.file.size} bytes`);
    
    jdParserService.processQueue({
      jobId: jobDescription._id,
      filePath: req.file.path,
      tenantConnection: req.tenant.connection
    }).then((result) => {
      console.log(`✅ Parsing promise resolved:`, result);
      console.log(`🧹 Cleaning up temp file: ${req.file.path}`);
      // Clean up temp file after parsing completes
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
        console.log(`✅ Temp file deleted successfully`);
      } else {
        console.log(`⚠️  Temp file already deleted: ${req.file.path}`);
      }
    }).catch(error => {
      console.error('❌ JD parsing error:', error);
      // Clean up temp file even on error
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    });

    res.status(201).json({
      success: true,
      message: 'JD uploaded successfully. Parsing in progress.',
      data: {
        jobDescriptionId: jobDescription._id,
        jobTitle: jobDescription.jobTitle,
        parsingStatus: 'processing',
        uploadedAt: jobDescription.createdAt
      }
    });

  } catch (error) {
    console.error('Upload JD error:', error);

    // Clean up temp file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: 'Failed to upload and parse JD',
      details: error.message
    });
  }
};

exports.getJDById = async (req, res) => {
  try {
    const { id } = req.params;
    const JobDescription = getTenantModel(req.tenant.connection, 'JobDescription');

    const jobDescription = await JobDescription.findById(id)
      .populate('uploadedBy', 'firstName lastName email')
      .populate('jobPostingId', 'title department location status');

    if (!jobDescription) {
      return res.status(404).json({
        success: false,
        error: 'Job description not found'
      });
    }

    res.status(200).json({
      success: true,
      data: jobDescription
    });

  } catch (error) {
    console.error('Get JD error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve job description',
      details: error.message
    });
  }
};

exports.checkParsingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const JobDescription = getTenantModel(req.tenant.connection, 'JobDescription');

    const jobDescription = await JobDescription.findById(id)
      .select('parsingStatus parsingError lastProcessedAt parsedData jobTitle');

    if (!jobDescription) {
      return res.status(404).json({
        success: false,
        error: 'Job description not found'
      });
    }

    const response = {
      success: true,
      data: {
        jobDescriptionId: id,
        jobTitle: jobDescription.jobTitle,
        parsingStatus: jobDescription.parsingStatus,
        isReady: jobDescription.parsingStatus === 'completed',
        lastProcessedAt: jobDescription.lastProcessedAt
      }
    };

    // Add parsing error if failed
    if (jobDescription.parsingStatus === 'failed') {
      response.data.error = jobDescription.parsingError;
    }

    // Add summary of parsed data if completed
    if (jobDescription.parsingStatus === 'completed' && jobDescription.parsedData) {
      response.data.summary = {
        requiredSkills: jobDescription.parsedData.requiredSkills?.length || 0,
        preferredSkills: jobDescription.parsedData.preferredSkills?.length || 0,
        experienceRequired: jobDescription.parsedData.experienceRequired || null,
        location: jobDescription.parsedData.jobLocation || null
      };
    }

    res.status(200).json(response);

  } catch (error) {
    console.error('Check parsing status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check parsing status',
      details: error.message
    });
  }
};

exports.getJDs = async (req, res) => {
  try {
    const JobDescription = getTenantModel(req.tenant.connection, 'JobDescription');
    const {
      status = 'active',
      parsingStatus,
      search,
      page = 1,
      limit = 10
    } = req.query;

    let query = { status };

    if (parsingStatus) {
      query.parsingStatus = parsingStatus;
    }

    if (search) {
      query.$text = { $search: search };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const jobDescriptions = await JobDescription.find(query)
      .populate('uploadedBy', 'firstName lastName email')
      .populate('jobPostingId', 'title department location status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await JobDescription.countDocuments(query);

    res.status(200).json({
      success: true,
      data: jobDescriptions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get JDs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve job descriptions',
      details: error.message
    });
  }
};

exports.updateJD = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const JobDescription = getTenantModel(req.tenant.connection, 'JobDescription');

    const jobDescription = await JobDescription.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!jobDescription) {
      return res.status(404).json({
        success: false,
        error: 'Job description not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Job description updated successfully',
      data: jobDescription
    });

  } catch (error) {
    console.error('Update JD error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update job description',
      details: error.message
    });
  }
};

exports.deleteJD = async (req, res) => {
  try {
    const { id } = req.params;
    const JobDescription = getTenantModel(req.tenant.connection, 'JobDescription');
    const JobPosting = getTenantModel(req.tenant.connection, 'JobPosting');

    const jobDescription = await JobDescription.findById(id);
    if (!jobDescription) {
      return res.status(404).json({
        success: false,
        error: 'Job description not found'
      });
    }

    // Remove JD reference from JobPosting
    if (jobDescription.jobPostingId) {
      await JobPosting.findByIdAndUpdate(jobDescription.jobPostingId, {
        $unset: { jobDescription: 1 },
        jdParsingStatus: 'not-uploaded'
      });
    }

    // Delete from S3 if exists
    if (jobDescription.originalFile?.s3Key) {
      await awsS3Service.deleteFile(jobDescription.originalFile.s3Key);
    }

    await JobDescription.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Job description deleted successfully'
    });

  } catch (error) {
    console.error('Delete JD error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete job description',
      details: error.message
    });
  }
};

exports.matchCandidates = async (req, res) => {
  try {
    const { id } = req.params;
    const { minScore = 0, maxResults = 50 } = req.query;
    const JobDescription = getTenantModel(req.tenant.connection, 'JobDescription');

    console.log(`🔍 JD Search - ID: ${id}, minScore: ${minScore}, maxResults: ${maxResults}`);

    const jobDescription = await JobDescription.findById(id);
    if (!jobDescription) {
      console.error(`❌ JD not found: ${id}`);
      return res.status(404).json({
        success: false,
        error: 'Job description not found'
      });
    }

    console.log(`📄 JD found: ${jobDescription.jobTitle}, Status: ${jobDescription.parsingStatus}`);

    if (jobDescription.parsingStatus !== 'completed') {
      console.error(`⚠️ JD not parsed yet: ${jobDescription.parsingStatus}`);
      return res.status(400).json({
        success: false,
        error: 'Job description parsing not completed yet'
      });
    }

    if (!jobDescription.parsedData) {
      console.error(`❌ JD parsedData missing for: ${id}`);
      return res.status(400).json({
        success: false,
        error: 'Job description data is missing. Please re-parse the JD.'
      });
    }

    console.log(`✅ JD data loaded, starting candidate matching...`);

    // Perform candidate matching (don't save to DB, just return results)
    const matches = await candidateMatchingService.matchCandidates(
      jobDescription,
      req.tenant.connection,
      { minScore: parseInt(minScore), maxResults: parseInt(maxResults) }
    );

    console.log(`📊 Found ${matches.length} matches`);

    // Populate candidate details for response
    const populatedMatches = await Promise.all(
      matches.map(async (match) => {
        const Candidate = getTenantModel(req.tenant.connection, 'Candidate');
        const candidate = await Candidate.findById(match.candidateId)
          .select('firstName lastName email phone skills experience currentDesignation currentCompany currentLocation');

        return {
          candidateId: match.candidateId,
          overallScore: match.overallScore,
          overallFit: match.overallFit,
          matchedSkills: match.matchedSkills, // Already simplified to just skill names
          relevanceExplanation: match.relevanceExplanation,
          candidate: candidate ? {
            id: candidate._id,
            name: `${candidate.firstName} ${candidate.lastName}`,
            email: candidate.email,
            phone: candidate.phone,
            skills: candidate.skills,
            experience: candidate.experience,
            currentDesignation: candidate.currentDesignation,
            currentCompany: candidate.currentCompany,
            currentLocation: candidate.currentLocation
          } : null
        };
      })
    );

    // Calculate statistics on-the-fly without saving
    const statistics = {
      totalCandidates: matches.length,
      averageScore: matches.length > 0
        ? (matches.reduce((sum, m) => sum + m.overallScore, 0) / matches.length).toFixed(2)
        : 0,
      scoreDistribution: {
        excellent: matches.filter(m => m.overallScore >= 80).length,
        good: matches.filter(m => m.overallScore >= 60 && m.overallScore < 80).length,
        average: matches.filter(m => m.overallScore >= 40 && m.overallScore < 60).length,
        poor: matches.filter(m => m.overallScore < 40).length
      }
    };

    console.log(`✅ JD search completed successfully`);

    res.status(200).json({
      success: true,
      data: {
        jobDescriptionId: id,
        jobTitle: jobDescription.jobTitle,
        totalMatches: matches.length,
        matches: populatedMatches,
        statistics: statistics
      }
    });

  } catch (error) {
    console.error('❌ Match candidates error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to match candidates',
      details: error.message
    });
  }
};

exports.getMatchingStatistics = async (req, res) => {
  try {
    const { id } = req.params;
    const { minScore = 0, maxResults = 50 } = req.query;
    const JobDescription = getTenantModel(req.tenant.connection, 'JobDescription');

    const jobDescription = await JobDescription.findById(id);
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

    // Perform matching to get fresh statistics
    const matches = await candidateMatchingService.matchCandidates(
      jobDescription,
      req.tenant.connection,
      { minScore: parseInt(minScore), maxResults: parseInt(maxResults) }
    );

    // Calculate statistics on-the-fly
    const statistics = {
      totalCandidates: matches.length,
      averageScore: matches.length > 0 
        ? (matches.reduce((sum, m) => sum + m.overallScore, 0) / matches.length).toFixed(2)
        : 0,
      scoreDistribution: {
        excellent: matches.filter(m => m.overallScore >= 80).length,
        good: matches.filter(m => m.overallScore >= 60 && m.overallScore < 80).length,
        average: matches.filter(m => m.overallScore >= 40 && m.overallScore < 60).length,
        poor: matches.filter(m => m.overallScore < 40).length
      },
      topSkills: this.getTopSkillsFromMatches(matches)
    };

    res.status(200).json({
      success: true,
      data: {
        jobDescriptionId: id,
        jobTitle: jobDescription.jobTitle,
        statistics
      }
    });

  } catch (error) {
    console.error('Get matching statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get matching statistics',
      details: error.message
    });
  }
};

// Helper function to get top skills from matches
function getTopSkillsFromMatches(matches) {
  const skillCounts = {};
  matches.forEach(match => {
    if (match.matchedSkills) {
      match.matchedSkills.forEach(skill => {
        skillCounts[skill] = (skillCounts[skill] || 0) + 1;
      });
    }
  });
  
  return Object.entries(skillCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([skill, count]) => ({ skill, count }));
}

exports.shortlistCandidate = async (req, res) => {
  try {
    const { id, candidateId } = req.params;
    const JobDescription = getTenantModel(req.tenant.connection, 'JobDescription');

    const jobDescription = await JobDescription.findById(id);
    if (!jobDescription) {
      return res.status(404).json({
        success: false,
        error: 'Job description not found'
      });
    }

    // Find and update the candidate match
    const matchIndex = jobDescription.candidateMatches.findIndex(
      match => match.candidateId.toString() === candidateId
    );

    if (matchIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Candidate match not found'
      });
    }

    jobDescription.candidateMatches[matchIndex].isShortlisted = true;
    jobDescription.markModified('candidateMatches');

    // Update statistics
    jobDescription.updateMatchStatistics();
    await jobDescription.save();

    res.status(200).json({
      success: true,
      message: 'Candidate shortlisted successfully',
      data: {
        jobDescriptionId: id,
        candidateId: candidateId,
        isShortlisted: true
      }
    });

  } catch (error) {
    console.error('Shortlist candidate error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to shortlist candidate',
      details: error.message
    });
  }
};

exports.getJDHealth = async (req, res) => {
  try {
    const health = jdParserService.getHealthStatus();

    const JobDescription = getTenantModel(req.tenant.connection, 'JobDescription');
    const stats = await JobDescription.aggregate([
      {
        $group: {
          _id: '$parsingStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    const parsingStats = stats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: {
        ...health,
        parsingStats
      }
    });

  } catch (error) {
    console.error('JD health check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get JD service health',
      details: error.message
    });
  }
};

exports.reparseJD = async (req, res) => {
  try {
    const { id } = req.params;
    const JobDescription = getTenantModel(req.tenant.connection, 'JobDescription');

    const jobDescription = await JobDescription.findById(id);
    if (!jobDescription) {
      return res.status(404).json({
        success: false,
        error: 'Job description not found'
      });
    }

    if (!jobDescription.originalFile?.url) {
      return res.status(400).json({
        success: false,
        error: 'No original file found to reparse'
      });
    }

    // Download file from S3 to temp location
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, `reparse-${Date.now()}-${jobDescription.originalFile.filename}`);

    // For now, we'll simulate re-parsing with the existing raw text
    // In production, you'd download from S3 and re-parse
    if (jobDescription.rawText) {
      const parsedData = await jdParserService.parseJDText(jobDescription.rawText);
      jobDescription.parsedData = parsedData;
      jobDescription.parsingStatus = 'completed';
      jobDescription.lastProcessedAt = new Date();
      await jobDescription.save();
    }

    res.status(200).json({
      success: true,
      message: 'JD reparsed successfully',
      data: jobDescription
    });

  } catch (error) {
    console.error('Reparse JD error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reparse JD',
      details: error.message
    });
  }
};