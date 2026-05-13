const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * SAP Connection Model
 * Stores SAP system connection configuration
 * Stored in global database
 */
const sapConnectionSchema = new mongoose.Schema({
  systemId: {
    type: String,
    required: [true, 'SAP System ID is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  systemName: {
    type: String,
    required: [true, 'System name is required'],
    trim: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  host: {
    type: String,
    required: [true, 'SAP host is required'],
    trim: true
  },
  client: {
    type: String,
    required: [true, 'SAP client is required'],
    trim: true
  },
  username: {
    type: String,
    required: [true, 'Username is required']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    select: false // Don't return password by default
  },
  // Encrypted password (for additional security)
  encryptedPassword: {
    type: String,
    select: false
  },
  systemNumber: {
    type: String,
    default: '00'
  },
  language: {
    type: String,
    default: 'EN'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'error'],
    default: 'inactive'
  },
  lastSync: {
    type: Date
  },
  lastSyncStatus: {
    type: String,
    enum: ['success', 'failed', 'partial']
  },
  lastError: {
    type: String
  },
  syncFrequency: {
    type: Number, // in minutes
    default: 60,
    min: 1
  },
  syncSettings: {
    employeeMaster: {
      enabled: { type: Boolean, default: true },
      direction: { type: String, enum: ['hrms_to_sap', 'sap_to_hrms', 'bidirectional'], default: 'bidirectional' },
      frequency: { type: Number, default: 60 } // minutes
    },
    leaveBalance: {
      enabled: { type: Boolean, default: true },
      direction: { type: String, enum: ['hrms_to_sap'], default: 'hrms_to_sap' },
      frequency: { type: Number, default: 60 }
    },
    attendance: {
      enabled: { type: Boolean, default: true },
      direction: { type: String, enum: ['hrms_to_sap'], default: 'hrms_to_sap' },
      frequency: { type: Number, default: 60 }
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Encrypt password before saving
sapConnectionSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-characters-long!!', 'utf8');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(this.password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    this.encryptedPassword = iv.toString('hex') + ':' + encrypted;
  }
  next();
});

// Indexes
sapConnectionSchema.index({ companyId: 1, status: 1 });
sapConnectionSchema.index({ systemId: 1 }, { unique: true });
sapConnectionSchema.index({ isActive: 1 });

module.exports = mongoose.model('SAPConnection', sapConnectionSchema);


