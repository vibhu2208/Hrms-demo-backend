const OfferTemplate = require('../models/OfferTemplate');
const Department = require('../models/Department');

/**
 * Get all offer templates
 * @route GET /api/offer-templates
 * @access Private (HR/Admin only)
 */
exports.getOfferTemplates = async (req, res) => {
  try {
    const { status, category, department } = req.query;
    let query = {};

    if (status) query.status = status;
    if (category) query.category = category;
    if (department) query.departments = department;

    const templates = await OfferTemplate.find(query)
      .populate('departments', 'name')
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: templates.length,
      data: templates
    });
  } catch (error) {
    console.error('Error fetching offer templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch offer templates',
      error: error.message
    });
  }
};

/**
 * Get single offer template
 * @route GET /api/offer-templates/:id
 * @access Private (HR/Admin only)
 */
exports.getOfferTemplate = async (req, res) => {
  try {
    const template = await OfferTemplate.findById(req.params.id)
      .populate('departments', 'name')
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Offer template not found'
      });
    }

    res.status(200).json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Error fetching offer template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch offer template',
      error: error.message
    });
  }
};

/**
 * Create new offer template
 * @route POST /api/offer-templates
 * @access Private (HR/Admin only)
 */
exports.createOfferTemplate = async (req, res) => {
  try {
    const {
      name,
      description,
      subject,
      content,
      variables,
      category,
      departments,
      designations,
      isDefault,
      settings
    } = req.body;

    const hrUserId = req.user.id;

    // Validate required fields
    if (!name || !subject || !content) {
      return res.status(400).json({
        success: false,
        message: 'Name, subject, and content are required'
      });
    }

    // If setting as default, unset other defaults in the same category
    if (isDefault) {
      await OfferTemplate.updateMany(
        { category, isDefault: true },
        { isDefault: false }
      );
    }

    const templateData = {
      name,
      description,
      subject,
      content,
      variables: variables || [],
      category: category || 'general',
      departments: departments || [],
      designations: designations || [],
      status: 'draft',
      isDefault: isDefault || false,
      settings: settings || {
        autoExpiry: { enabled: true, hours: 24 },
        reminders: { enabled: true, schedule: [{ hours: 12, message: 'Reminder: Your offer expires in 12 hours' }] },
        requireESignature: false,
        allowCounterOffer: false
      },
      createdBy: hrUserId
    };

    const template = await OfferTemplate.create(templateData);

    const populatedTemplate = await OfferTemplate.findById(template._id)
      .populate('departments', 'name')
      .populate('createdBy', 'firstName lastName email');

    res.status(201).json({
      success: true,
      message: 'Offer template created successfully',
      data: populatedTemplate
    });
  } catch (error) {
    console.error('Error creating offer template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create offer template',
      error: error.message
    });
  }
};

/**
 * Update offer template
 * @route PUT /api/offer-templates/:id
 * @access Private (HR/Admin only)
 */
exports.updateOfferTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const hrUserId = req.user.id;

    const template = await OfferTemplate.findById(id);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Offer template not found'
      });
    }

    // If setting as default, unset other defaults in the same category
    if (req.body.isDefault && !template.isDefault) {
      await OfferTemplate.updateMany(
        { category: req.body.category || template.category, _id: { $ne: id } },
        { isDefault: false }
      );
    }

    // Update template
    const updatedTemplate = await OfferTemplate.findByIdAndUpdate(
      id,
      {
        ...req.body,
        updatedBy: hrUserId,
        version: template.version ? `${parseFloat(template.version) + 0.1}` : '1.1'
      },
      { new: true, runValidators: true }
    ).populate('departments', 'name')
     .populate('createdBy', 'firstName lastName email')
     .populate('updatedBy', 'firstName lastName email');

    res.status(200).json({
      success: true,
      message: 'Offer template updated successfully',
      data: updatedTemplate
    });
  } catch (error) {
    console.error('Error updating offer template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update offer template',
      error: error.message
    });
  }
};

/**
 * Delete offer template
 * @route DELETE /api/offer-templates/:id
 * @access Private (HR/Admin only)
 */
exports.deleteOfferTemplate = async (req, res) => {
  try {
    const template = await OfferTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Offer template not found'
      });
    }

    // Check if template is being used in active onboarding processes
    // This would require checking the Onboarding model
    // For now, we'll allow deletion but in production you might want to prevent this

    await OfferTemplate.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Offer template deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting offer template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete offer template',
      error: error.message
    });
  }
};

/**
 * Activate/Deactivate offer template
 * @route PUT /api/offer-templates/:id/status
 * @access Private (HR/Admin only)
 */
exports.updateTemplateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive', 'draft'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be active, inactive, or draft'
      });
    }

    const template = await OfferTemplate.findByIdAndUpdate(
      id,
      { status, updatedBy: req.user.id },
      { new: true }
    ).populate('departments', 'name');

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Offer template not found'
      });
    }

    res.status(200).json({
      success: true,
      message: `Template ${status === 'active' ? 'activated' : status === 'inactive' ? 'deactivated' : 'saved as draft'} successfully`,
      data: template
    });
  } catch (error) {
    console.error('Error updating template status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update template status',
      error: error.message
    });
  }
};

/**
 * Preview offer template with sample data
 * @route POST /api/offer-templates/:id/preview
 * @access Private (HR/Admin only)
 */
exports.previewTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { sampleData } = req.body;

    const template = await OfferTemplate.findById(id);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Offer template not found'
      });
    }

    // Default sample data if not provided
    const defaultSampleData = {
      candidateName: 'John Doe',
      designation: 'Software Engineer',
      ctc: '500000',
      startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toDateString(),
      companyName: 'SPC MANAGMENT',
      department: 'Engineering'
    };

    const previewData = { ...defaultSampleData, ...sampleData };

    // Replace variables in content
    let previewContent = template.content;
    let previewSubject = template.subject;

    // Replace common variables
    Object.entries(previewData).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      previewContent = previewContent.replace(regex, value);
      previewSubject = previewSubject.replace(regex, value);
    });

    res.status(200).json({
      success: true,
      data: {
        subject: previewSubject,
        content: previewContent,
        sampleData: previewData,
        template: {
          id: template._id,
          name: template.name,
          version: template.version
        }
      }
    });
  } catch (error) {
    console.error('Error previewing template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to preview template',
      error: error.message
    });
  }
};

/**
 * Get default template for category
 * @route GET /api/offer-templates/default/:category
 * @access Private (HR/Admin only)
 */
exports.getDefaultTemplate = async (req, res) => {
  try {
    const { category } = req.params;

    const template = await OfferTemplate.findOne({
      category,
      isDefault: true,
      status: 'active'
    }).populate('departments', 'name');

    if (!template) {
      return res.status(404).json({
        success: false,
        message: `No default template found for category: ${category}`
      });
    }

    res.status(200).json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Error fetching default template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch default template',
      error: error.message
    });
  }
};
