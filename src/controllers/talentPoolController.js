const TalentPool = require('../models/TalentPool');

// @desc    Submit resume to talent pool (Public)
// @route   POST /api/public/talent-pool
// @access  Public
exports.submitToTalentPool = async (req, res) => {
  try {
    const talentData = {
      ...req.body,
      timeline: [{
        action: 'Resume Submitted',
        description: `Applied for ${req.body.desiredPosition} in ${req.body.desiredDepartment}`,
        timestamp: new Date()
      }]
    };

    const talent = await TalentPool.create(talentData);

    res.status(201).json({
      success: true,
      message: 'Thank you for your interest! Your resume has been submitted successfully. We will contact you if a suitable opportunity arises.',
      data: {
        talentCode: talent.talentCode,
        name: talent.name,
        email: talent.email
      }
    });
  } catch (error) {
    console.error('Talent pool submission error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: messages
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Failed to submit resume. Please try again.' 
    });
  }
};

// @desc    Get all talent pool submissions
// @route   GET /api/talent-pool
// @access  Private (Admin, HR)
exports.getTalentPool = async (req, res) => {
  try {
    const { 
      status, 
      department, 
      position, 
      minExperience, 
      maxExperience,
      skills,
      search 
    } = req.query;

    let query = {};

    if (status) query.status = status;
    if (department) query.desiredDepartment = { $regex: department, $options: 'i' };
    if (position) query.desiredPosition = { $regex: position, $options: 'i' };
    
    if (minExperience || maxExperience) {
      query['experience.years'] = {};
      if (minExperience) query['experience.years'].$gte = parseInt(minExperience);
      if (maxExperience) query['experience.years'].$lte = parseInt(maxExperience);
    }

    if (skills) {
      const skillArray = skills.split(',').map(s => s.trim());
      query.skills = { $in: skillArray };
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { talentCode: { $regex: search, $options: 'i' } },
        { exEmployeeCode: { $regex: search, $options: 'i' } },
        { desiredPosition: { $regex: search, $options: 'i' } }
      ];
    }

    const talents = await TalentPool.find(query)
      .populate('reviewedBy', 'firstName lastName')
      .populate('movedToJob', 'title')
      .sort({ createdAt: -1 });

    res.status(200).json({ 
      success: true, 
      count: talents.length, 
      data: talents 
    });
  } catch (error) {
    console.error('Get talent pool error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Get single talent pool entry
// @route   GET /api/talent-pool/:id
// @access  Private (Admin, HR)
exports.getTalentPoolEntry = async (req, res) => {
  try {
    const talent = await TalentPool.findById(req.params.id)
      .populate('reviewedBy', 'firstName lastName')
      .populate('movedToJob', 'title department')
      .populate('timeline.performedBy', 'firstName lastName');

    if (!talent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Talent pool entry not found' 
      });
    }

    res.status(200).json({ 
      success: true, 
      data: talent 
    });
  } catch (error) {
    console.error('Get talent pool entry error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Update talent pool entry status
// @route   PUT /api/talent-pool/:id/status
// @access  Private (Admin, HR)
exports.updateTalentStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;

    const talent = await TalentPool.findById(req.params.id);
    if (!talent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Talent pool entry not found' 
      });
    }

    talent.status = status;
    if (notes) talent.notes = notes;
    talent.reviewedBy = req.user.employeeId;
    talent.reviewedAt = Date.now();

    talent.timeline.push({
      action: `Status Updated to ${status}`,
      description: notes || '',
      performedBy: req.user.employeeId,
      timestamp: new Date()
    });

    await talent.save();

    res.status(200).json({ 
      success: true, 
      message: 'Status updated successfully', 
      data: talent 
    });
  } catch (error) {
    console.error('Update talent status error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Move talent to job posting
// @route   POST /api/talent-pool/:id/move-to-job
// @access  Private (Admin, HR)
exports.moveToJob = async (req, res) => {
  try {
    const { jobId } = req.body;

    const talent = await TalentPool.findById(req.params.id);
    if (!talent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Talent pool entry not found' 
      });
    }

    talent.movedToJob = jobId;
    talent.movedAt = Date.now();
    talent.status = 'shortlisted';

    talent.timeline.push({
      action: 'Moved to Job Posting',
      description: `Candidate moved to job posting`,
      performedBy: req.user.employeeId,
      timestamp: new Date()
    });

    await talent.save();

    // Optionally create a candidate entry from talent pool data
    const Candidate = require('../models/Candidate');
    const candidateData = {
      firstName: talent.name.split(' ')[0],
      lastName: talent.name.split(' ').slice(1).join(' ') || talent.name.split(' ')[0],
      email: talent.email,
      phone: talent.phone,
      appliedFor: jobId,
      source: 'talent-pool',
      experience: talent.experience,
      currentCompany: talent.currentCompany,
      currentDesignation: talent.currentDesignation,
      currentCTC: talent.currentCTC,
      expectedCTC: talent.expectedCTC,
      noticePeriod: talent.noticePeriod,
      skills: talent.skills,
      education: talent.education,
      resume: talent.resume,
      currentLocation: talent.currentLocation,
      preferredLocation: talent.preferredLocation,
      stage: 'screening',
      timeline: [{
        action: 'Moved from Talent Pool',
        description: `Candidate moved from talent pool (${talent.talentCode})`,
        timestamp: new Date()
      }]
    };

    const candidate = await Candidate.create(candidateData);

    res.status(200).json({ 
      success: true, 
      message: 'Candidate moved to job posting successfully', 
      data: { talent, candidate } 
    });
  } catch (error) {
    console.error('Move to job error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Delete talent pool entry
// @route   DELETE /api/talent-pool/:id
// @access  Private (Admin)
exports.deleteTalentPoolEntry = async (req, res) => {
  try {
    const talent = await TalentPool.findByIdAndDelete(req.params.id);
    
    if (!talent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Talent pool entry not found' 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Talent pool entry deleted successfully' 
    });
  } catch (error) {
    console.error('Delete talent pool entry error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

module.exports = exports;
