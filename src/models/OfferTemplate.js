const mongoose = require('mongoose');

const offerTemplateSchema = new mongoose.Schema({
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
  
  // Template Categories
  category: {
    type: String,
    enum: ['full-time', 'part-time', 'contract', 'intern', 'executive', 'general'],
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
        default: true
      },
      hours: {
        type: Number,
        default: 24
      }
    },
    reminders: {
      enabled: {
        type: Boolean,
        default: true
      },
      schedule: [{
        hours: Number,
        message: String
      }]
    },
    requireESignature: {
      type: Boolean,
      default: false
    },
    allowCounterOffer: {
      type: Boolean,
      default: false
    }
  },
  
  // Approval Workflow
  approvalRequired: {
    type: Boolean,
    default: false
  },
  
  approvers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  }],
  
  // Tags for organization
  tags: [String]
  
}, {
  timestamps: true
});

// Generate template ID
offerTemplateSchema.pre('save', async function(next) {
  if (!this.templateId) {
    const count = await mongoose.model('OfferTemplate').countDocuments();
    this.templateId = `OFT${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

// Ensure only one default template per category
offerTemplateSchema.pre('save', async function(next) {
  if (this.isDefault && this.isModified('isDefault')) {
    await mongoose.model('OfferTemplate').updateMany(
      { category: this.category, _id: { $ne: this._id } },
      { isDefault: false }
    );
  }
  next();
});

// Index for better query performance
offerTemplateSchema.index({ status: 1, category: 1 });
offerTemplateSchema.index({ departments: 1 });
offerTemplateSchema.index({ isDefault: 1, category: 1 });

module.exports = mongoose.model('OfferTemplate', offerTemplateSchema);
