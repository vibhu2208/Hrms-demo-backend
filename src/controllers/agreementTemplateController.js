const AgreementTemplate = require('../models/AgreementTemplate');
const { getTenantModel } = require('../utils/tenantModels');

/**
 * @desc    Get all agreement templates
 * @route   GET /api/agreement-templates
 * @access  Private
 */
exports.getAgreementTemplates = async (req, res) => {
  try {
    console.log('🔍 Fetching agreement templates...');
    console.log('🏢 Tenant:', req.tenant?.name || 'Unknown');
    
    const AgreementTemplateModel = getTenantModel(req.tenant.connection, 'AgreementTemplate');
    
    const {
      page = 1,
      limit = 10,
      status,
      category,
      department,
      search
    } = req.query;

    console.log('📋 Query params:', { page, limit, status, category, department, search });

    // Build query
    const query = {};
    
    if (status) query.status = status;
    if (category) query.category = category;
    if (department) query.departments = department;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    console.log('🔍 Final query:', query);

    const templates = await AgreementTemplateModel.find(query)
      .populate('departments', 'name')
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName email')
      .populate('approvers', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await AgreementTemplateModel.countDocuments(query);

    console.log(`📊 Found ${templates.length} agreement templates (total: ${total})`);
    templates.forEach(t => {
      console.log(`  - ${t.name} (${t.status})`);
    });

    res.status(200).json({
      success: true,
      data: templates,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching agreement templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agreement templates'
    });
  }
};

/**
 * @desc    Get single agreement template
 * @route   GET /api/agreement-templates/:id
 * @access  Private
 */
exports.getAgreementTemplate = async (req, res) => {
  try {
    const AgreementTemplateModel = getTenantModel(req.tenant.connection, 'AgreementTemplate');
    
    const template = await AgreementTemplateModel.findById(req.params.id)
      .populate('departments', 'name')
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName email')
      .populate('approvers', 'firstName lastName email');

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Agreement template not found'
      });
    }

    res.status(200).json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Error fetching agreement template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agreement template'
    });
  }
};

/**
 * @desc    Create new agreement template
 * @route   POST /api/agreement-templates
 * @access  Private
 */
exports.createAgreementTemplate = async (req, res) => {
  try {
    const AgreementTemplateModel = getTenantModel(req.tenant.connection, 'AgreementTemplate');
    
    const templateData = {
      ...req.body,
      createdBy: req.user.id,
      updatedBy: req.user.id
    };

    const template = new AgreementTemplateModel(templateData);
    await template.save();

    await template.populate('departments', 'name');
    await template.populate('createdBy', 'firstName lastName email');

    res.status(201).json({
      success: true,
      data: template,
      message: 'Agreement template created successfully'
    });
  } catch (error) {
    console.error('Error creating agreement template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create agreement template'
    });
  }
};

/**
 * @desc    Update agreement template
 * @route   PUT /api/agreement-templates/:id
 * @access  Private
 */
exports.updateAgreementTemplate = async (req, res) => {
  try {
    const AgreementTemplateModel = getTenantModel(req.tenant.connection, 'AgreementTemplate');
    
    const template = await AgreementTemplateModel.findById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Agreement template not found'
      });
    }

    const updateData = {
      ...req.body,
      updatedBy: req.user.id
    };

    Object.assign(template, updateData);
    await template.save();

    await template.populate('departments', 'name');
    await template.populate('updatedBy', 'firstName lastName email');

    res.status(200).json({
      success: true,
      data: template,
      message: 'Agreement template updated successfully'
    });
  } catch (error) {
    console.error('Error updating agreement template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update agreement template'
    });
  }
};

/**
 * @desc    Delete agreement template
 * @route   DELETE /api/agreement-templates/:id
 * @access  Private
 */
exports.deleteAgreementTemplate = async (req, res) => {
  try {
    const AgreementTemplateModel = getTenantModel(req.tenant.connection, 'AgreementTemplate');
    
    const template = await AgreementTemplateModel.findById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Agreement template not found'
      });
    }

    // Check if template is being used
    if (template.usageCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete template that has been used. Consider deactivating it instead.'
      });
    }

    await AgreementTemplateModel.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Agreement template deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting agreement template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete agreement template'
    });
  }
};

/**
 * @desc    Duplicate agreement template
 * @route   POST /api/agreement-templates/:id/duplicate
 * @access  Private
 */
exports.duplicateAgreementTemplate = async (req, res) => {
  try {
    const AgreementTemplateModel = getTenantModel(req.tenant.connection, 'AgreementTemplate');
    
    const originalTemplate = await AgreementTemplateModel.findById(req.params.id);

    if (!originalTemplate) {
      return res.status(404).json({
        success: false,
        message: 'Agreement template not found'
      });
    }

    const duplicateData = {
      ...originalTemplate.toObject(),
      _id: undefined,
      templateId: undefined,
      name: `${originalTemplate.name} (Copy)`,
      status: 'draft',
      isDefault: false,
      usageCount: 0,
      lastUsedAt: undefined,
      createdBy: req.user.id,
      updatedBy: req.user.id,
      createdAt: undefined,
      updatedAt: undefined
    };

    const duplicateTemplate = new AgreementTemplateModel(duplicateData);
    await duplicateTemplate.save();

    await duplicateTemplate.populate('departments', 'name');
    await duplicateTemplate.populate('createdBy', 'firstName lastName email');

    res.status(201).json({
      success: true,
      data: duplicateTemplate,
      message: 'Agreement template duplicated successfully'
    });
  } catch (error) {
    console.error('Error duplicating agreement template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to duplicate agreement template'
    });
  }
};

/**
 * @desc    Get default agreement template by category
 * @route   GET /api/agreement-templates/default/:category
 * @access  Private
 */
exports.getDefaultAgreementTemplate = async (req, res) => {
  try {
    const AgreementTemplateModel = getTenantModel(req.tenant.connection, 'AgreementTemplate');
    
    const { category } = req.params;

    const template = await AgreementTemplateModel.findOne({
      category,
      isDefault: true,
      status: 'active'
    })
      .populate('departments', 'name')
      .populate('createdBy', 'firstName lastName email');

    if (!template) {
      // If no default template found, return the first active template in the category
      const fallbackTemplate = await AgreementTemplateModel.findOne({
        category,
        status: 'active'
      })
        .populate('departments', 'name')
        .populate('createdBy', 'firstName lastName email');

      return res.status(200).json({
        success: true,
        data: fallbackTemplate,
        message: fallbackTemplate ? 'Using fallback template' : 'No template found for this category'
      });
    }

    res.status(200).json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Error fetching default agreement template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch default agreement template'
    });
  }
};

/**
 * @desc    Preview agreement template with sample data
 * @route   POST /api/agreement-templates/:id/preview
 * @access  Private
 */
exports.previewAgreementTemplate = async (req, res) => {
  try {
    const AgreementTemplateModel = getTenantModel(req.tenant.connection, 'AgreementTemplate');
    
    const template = await AgreementTemplateModel.findById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Agreement template not found'
      });
    }

    // Replace variables with sample data
    let content = template.content;
    let subject = template.subject;

    // Sample data for preview
    const sampleData = {
      employeeName: 'John Doe',
      employeeEmail: 'john.doe@example.com',
      employeeCode: 'EMP001',
      designation: 'Software Engineer',
      department: 'Engineering',
      joiningDate: new Date().toLocaleDateString(),
      companyName: 'Sample Company',
      companyAddress: '123 Business St, City, State',
      ctc: '800000',
      // Add more sample variables as needed
    };

    // Replace template variables
    template.variables.forEach(variable => {
      const regex = new RegExp(`{{${variable.key}}}`, 'g');
      const value = sampleData[variable.key] || `[${variable.label || variable.key}]`;
      content = content.replace(regex, value);
      subject = subject.replace(regex, value);
    });

    res.status(200).json({
      success: true,
      data: {
        subject,
        content,
        templateName: template.name
      }
    });
  } catch (error) {
    console.error('Error previewing agreement template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to preview agreement template'
    });
  }
};
