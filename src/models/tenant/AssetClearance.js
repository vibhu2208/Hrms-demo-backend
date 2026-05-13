const mongoose = require('mongoose');

/**
 * Asset Clearance Model - IT/Admin assets tracking
 * Phase 1: Module Setup & Data Model
 */
const assetClearanceSchema = new mongoose.Schema({
  // Reference Information
  offboardingRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OffboardingRequest',
    required: true,
    index: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true
  },

  // Physical Assets
  physicalAssets: [{
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset'
    },
    assetType: {
      type: String,
      enum: [
        'laptop', 'desktop', 'monitor', 'keyboard', 'mouse', 'headphones',
        'mobile_phone', 'tablet', 'printer', 'scanner', 'projector',
        'furniture', 'books', 'stationery', 'id_card', 'access_card',
        'vehicle', 'tools', 'equipment', 'other'
      ]
    },
    assetName: String,
    assetCode: String,
    serialNumber: String,
    brand: String,
    model: String,
    assignedDate: Date,
    
    // Return Details
    returnStatus: {
      type: String,
      enum: ['pending', 'returned', 'damaged', 'lost', 'not_applicable'],
      default: 'pending'
    },
    returnDate: Date,
    returnedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    
    // Condition Assessment
    conditionAtReturn: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor', 'damaged', 'not_working']
    },
    damageDescription: String,
    repairRequired: Boolean,
    repairCost: Number,
    
    // Documentation
    returnReceipt: String, // File URL
    photos: [String], // File URLs
    notes: String,
    
    // Replacement/Recovery
    replacementRequired: Boolean,
    replacementCost: Number,
    recoveryAction: {
      type: String,
      enum: ['none', 'deduct_from_salary', 'insurance_claim', 'write_off']
    },
    recoveryAmount: Number,
    recoveryStatus: {
      type: String,
      enum: ['not_applicable', 'pending', 'in_progress', 'completed']
    }
  }],

  // Digital Assets and Access
  digitalAssets: [{
    assetType: {
      type: String,
      enum: [
        'email_account', 'system_login', 'software_license', 'cloud_storage',
        'vpn_access', 'database_access', 'api_keys', 'certificates',
        'domain_access', 'social_media', 'shared_drives', 'other'
      ]
    },
    assetName: String,
    username: String,
    systemName: String,
    accessLevel: String,
    
    // Revocation Details
    revocationStatus: {
      type: String,
      enum: ['pending', 'revoked', 'transferred', 'not_applicable'],
      default: 'pending'
    },
    revocationDate: Date,
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    
    // Transfer Details
    transferredTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    transferDate: Date,
    
    // Data Handling
    dataBackupRequired: Boolean,
    dataBackupCompleted: Boolean,
    dataBackupLocation: String,
    dataRetentionPeriod: Number, // in days
    dataDestructionDate: Date,
    
    notes: String
  }],

  // Security Items
  securityItems: [{
    itemType: {
      type: String,
      enum: [
        'id_badge', 'access_card', 'security_token', 'keys', 'parking_pass',
        'building_access', 'safe_combination', 'alarm_code', 'other'
      ]
    },
    itemName: String,
    itemCode: String,
    accessAreas: [String],
    
    returnStatus: {
      type: String,
      enum: ['pending', 'returned', 'deactivated', 'lost', 'not_applicable'],
      default: 'pending'
    },
    returnDate: Date,
    returnedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    deactivationDate: Date,
    deactivatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    
    notes: String
  }],

  // Company Property
  companyProperty: [{
    propertyType: {
      type: String,
      enum: [
        'documents', 'files', 'intellectual_property', 'client_data',
        'confidential_info', 'training_materials', 'manuals', 'other'
      ]
    },
    propertyName: String,
    description: String,
    location: String,
    
    returnStatus: {
      type: String,
      enum: ['pending', 'returned', 'destroyed', 'transferred', 'not_applicable'],
      default: 'pending'
    },
    returnDate: Date,
    returnedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    
    // Confidentiality
    confidentialityLevel: {
      type: String,
      enum: ['public', 'internal', 'confidential', 'restricted', 'top_secret']
    },
    destructionRequired: Boolean,
    destructionDate: Date,
    destructionMethod: String,
    destructionWitness: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    
    notes: String
  }],

  // Overall Clearance Status
  overallStatus: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'partial'],
    default: 'pending'
  },
  completionPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },

  // Department Clearances
  departmentClearances: [{
    department: {
      type: String,
      enum: ['it', 'admin', 'security', 'facilities', 'finance', 'hr'],
      required: true
    },
    clearedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    clearanceDate: Date,
    status: {
      type: String,
      enum: ['pending', 'cleared', 'partial', 'issues'],
      default: 'pending'
    },
    notes: String,
    issues: [String],
    followUpRequired: Boolean,
    followUpDate: Date
  }],

  // Financial Impact
  totalRecoveryAmount: {
    type: Number,
    default: 0
  },
  totalRepairCost: {
    type: Number,
    default: 0
  },
  totalReplacementCost: {
    type: Number,
    default: 0
  },
  netFinancialImpact: {
    type: Number,
    default: 0
  },

  // Timeline
  clearanceStartDate: Date,
  expectedCompletionDate: Date,
  actualCompletionDate: Date,

  // Final Sign-off
  finalClearance: {
    cleared: Boolean,
    clearedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    clearanceDate: Date,
    conditions: [String],
    notes: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
assetClearanceSchema.index({ offboardingRequestId: 1 });
assetClearanceSchema.index({ employeeId: 1, clientId: 1 });
assetClearanceSchema.index({ overallStatus: 1 });
assetClearanceSchema.index({ 'departmentClearances.department': 1, 'departmentClearances.status': 1 });

// Virtual for physical assets completion
assetClearanceSchema.virtual('physicalAssetsCompletion').get(function() {
  if (!this.physicalAssets || this.physicalAssets.length === 0) return 100;
  const completed = this.physicalAssets.filter(a => 
    ['returned', 'not_applicable'].includes(a.returnStatus)
  ).length;
  return Math.round((completed / this.physicalAssets.length) * 100);
});

// Virtual for digital assets completion
assetClearanceSchema.virtual('digitalAssetsCompletion').get(function() {
  if (!this.digitalAssets || this.digitalAssets.length === 0) return 100;
  const completed = this.digitalAssets.filter(a => 
    ['revoked', 'transferred', 'not_applicable'].includes(a.revocationStatus)
  ).length;
  return Math.round((completed / this.digitalAssets.length) * 100);
});

// Virtual for security items completion
assetClearanceSchema.virtual('securityItemsCompletion').get(function() {
  if (!this.securityItems || this.securityItems.length === 0) return 100;
  const completed = this.securityItems.filter(s => 
    ['returned', 'deactivated', 'not_applicable'].includes(s.returnStatus)
  ).length;
  return Math.round((completed / this.securityItems.length) * 100);
});

// Virtual for company property completion
assetClearanceSchema.virtual('companyPropertyCompletion').get(function() {
  if (!this.companyProperty || this.companyProperty.length === 0) return 100;
  const completed = this.companyProperty.filter(p => 
    ['returned', 'destroyed', 'transferred', 'not_applicable'].includes(p.returnStatus)
  ).length;
  return Math.round((completed / this.companyProperty.length) * 100);
});

// Pre-save middleware
assetClearanceSchema.pre('save', function(next) {
  // Calculate overall completion percentage
  const physicalCompletion = this.physicalAssetsCompletion;
  const digitalCompletion = this.digitalAssetsCompletion;
  const securityCompletion = this.securityItemsCompletion;
  const propertyCompletion = this.companyPropertyCompletion;
  
  this.completionPercentage = Math.round(
    (physicalCompletion + digitalCompletion + securityCompletion + propertyCompletion) / 4
  );

  // Update overall status
  if (this.completionPercentage === 100) {
    this.overallStatus = 'completed';
    if (!this.actualCompletionDate) {
      this.actualCompletionDate = new Date();
    }
  } else if (this.completionPercentage > 0) {
    this.overallStatus = 'in_progress';
  }

  // Calculate financial impact
  this.totalRecoveryAmount = this.physicalAssets.reduce((sum, asset) => 
    sum + (asset.recoveryAmount || 0), 0
  );
  this.totalRepairCost = this.physicalAssets.reduce((sum, asset) => 
    sum + (asset.repairCost || 0), 0
  );
  this.totalReplacementCost = this.physicalAssets.reduce((sum, asset) => 
    sum + (asset.replacementCost || 0), 0
  );
  this.netFinancialImpact = this.totalRecoveryAmount + this.totalRepairCost + this.totalReplacementCost;

  next();
});

// Static methods
assetClearanceSchema.statics.getByEmployee = function(employeeId, clientId) {
  return this.findOne({ employeeId, clientId })
    .populate('employeeId', 'firstName lastName email employeeCode');
};

assetClearanceSchema.statics.getPendingClearances = function(clientId) {
  return this.find({
    clientId,
    overallStatus: { $in: ['pending', 'in_progress'] }
  }).populate('employeeId', 'firstName lastName email employeeCode');
};

assetClearanceSchema.statics.getDepartmentPendingItems = function(department, clientId) {
  return this.find({
    clientId,
    'departmentClearances.department': department,
    'departmentClearances.status': 'pending'
  }).populate('employeeId', 'firstName lastName email employeeCode');
};

module.exports = assetClearanceSchema;
