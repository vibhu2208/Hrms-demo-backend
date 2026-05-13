const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  description: {
    type: String
  },
  category: {
    type: String,
    enum: ['email', 'branding', 'security', 'features', 'integrations', 'notifications'],
    required: true
  },
  isEditable: {
    type: Boolean,
    default: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for better query performance
systemConfigSchema.index({ category: 1, key: 1 });

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
