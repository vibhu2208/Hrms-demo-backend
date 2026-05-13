const mongoose = require('mongoose');

const agreementTemplateSchema = new mongoose.Schema({
  templateId: {
    type: String,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  
  // Template Content
  subject: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  
  // Template Variables/Placeholders
  variables: [{
    key: {
      type: String,
      required: true
    },
    label: String,
    type: {
      type: String,
      enum: ['text', 'number', 'date', 'currency', 'boolean'],
      default: 'text'
    },
    required: {
      type: Boolean,
      default: false
    },
    defaultValue: String,
    description: String
  }],
  
  // Agreement Categories
  category: {
    type: String,
    enum: ['employment', 'confidentiality', 'non-compete', 'ip-assignment', 'remote-work', 'general'],
    default: 'general'
  },
  
  // Department/Role specific
  departments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  }],
  
  designations: [String],
  
  // Template Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'draft'],
    default: 'draft'
  },
  
  // Version Control
  version: {
    type: String,
    default: '1.0'
  },
  
  isDefault: {
    type: Boolean,
    default: false
  },
  
  // Legal & Compliance
  legalReviewed: {
    type: Boolean,
    default: false
  },
  
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  
  reviewedAt: Date,
  
  // Usage Statistics
  usageCount: {
    type: Number,
    default: 0
  },
  
  lastUsedAt: Date,
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  
  // Template Settings
  settings: {
    autoExpiry: {
      enabled: {
        type: Boolean,
        default: false
      },
      days: {
        type: Number,
        default: 30
      }
    },
    reminders: {
      enabled: {
        type: Boolean,
        default: false
      },
      schedule: [{
        days: Number,
        message: String
      }]
    },
    requireESignature: {
      type: Boolean,
      default: true
    },
    requireWitness: {
      type: Boolean,
      default: false
    },
    allowDigitalSignature: {
      type: Boolean,
      default: true
    }
  },
  
  // Approval Workflow
  approvalRequired: {
    type: Boolean,
    default: true
  },
  
  approvers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  }],
  
  // Agreement Specific Settings
  agreementSettings: {
    effectiveDate: {
      type: String,
      enum: ['joining-date', 'custom-date', 'signature-date'],
      default: 'joining-date'
    },
    duration: {
      type: String,
      enum: ['permanent', 'fixed-term', 'project-based'],
      default: 'permanent'
    },
    termLength: Number, // in months for fixed-term
    renewalRequired: {
      type: Boolean,
      default: false
    },
    renewalNoticeDays: {
      type: Number,
      default: 30
    }
  },
  
  // Tags for organization
  tags: [String]
  
}, {
  timestamps: true
});

// Generate template ID
agreementTemplateSchema.pre('save', async function(next) {
  if (!this.templateId) {
    const count = await mongoose.model('AgreementTemplate').countDocuments();
    this.templateId = `AGT${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

// Ensure only one default template per category
agreementTemplateSchema.pre('save', async function(next) {
  if (this.isDefault && this.isModified('isDefault')) {
    await mongoose.model('AgreementTemplate').updateMany(
      { category: this.category, _id: { $ne: this._id } },
      { isDefault: false }
    );
  }
  next();
});

// Index for better query performance
agreementTemplateSchema.index({ status: 1, category: 1 });
agreementTemplateSchema.index({ departments: 1 });
agreementTemplateSchema.index({ isDefault: 1, category: 1 });

module.exports = mongoose.model('AgreementTemplate', agreementTemplateSchema);
