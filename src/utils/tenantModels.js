const mongoose = require('mongoose');

// Import all models and extract schemas
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Leave = require('../models/Leave');
const Attendance = require('../models/Attendance');
const Payroll = require('../models/Payroll');
const Asset = require('../models/Asset');
const JobPosting = require('../models/JobPosting');
const Onboarding = require('../models/Onboarding');
const Offboarding = require('../models/Offboarding');
const Client = require('../models/Client');
const Project = require('../models/Project');
const TeamMeeting = require('../models/TeamMeeting');
const Timesheet = require('../models/Timesheet');
const Document = require('../models/Document');
const Compliance = require('../models/Compliance');
const Candidate = require('../models/Candidate');
const Feedback = require('../models/Feedback');
const Notification = require('../models/Notification');
const ExitProcess = require('../models/ExitProcess');
const TalentPool = require('../models/TalentPool');
const OfferTemplate = require('../models/OfferTemplate');
const AgreementTemplate = require('../models/AgreementTemplate');
const ResumePool = require('../models/ResumePool');
const JobDescription = require('../models/JobDescription');

// Import tenant-specific models
const TenantUser = require('../models/tenant/TenantUser');

// Import offboarding related models (if they exist)
let OffboardingRequest, OffboardingTask, HandoverDetail, AssetClearance, FinalSettlement, ExitFeedback;
let CandidateDocumentUploadToken, CandidateDocument, DocumentConfiguration;

try {
  OffboardingRequest = require('../models/tenant/OffboardingRequest');
} catch (e) {
  OffboardingRequest = null;
}

try {
  OffboardingTask = require('../models/tenant/OffboardingTask');
} catch (e) {
  OffboardingTask = null;
}

try {
  HandoverDetail = require('../models/tenant/HandoverDetail');
} catch (e) {
  HandoverDetail = null;
}

try {
  AssetClearance = require('../models/tenant/AssetClearance');
} catch (e) {
  AssetClearance = null;
}

try {
  FinalSettlement = require('../models/tenant/FinalSettlement');
} catch (e) {
  FinalSettlement = null;
}

try {
  ExitFeedback = require('../models/tenant/ExitFeedback');
} catch (e) {
  ExitFeedback = null;
}

// Import document upload models
try {
  CandidateDocumentUploadToken = require('../models/tenant/CandidateDocumentUploadToken');
} catch (e) {
  CandidateDocumentUploadToken = null;
}

try {
  CandidateDocument = require('../models/tenant/CandidateDocument');
} catch (e) {
  CandidateDocument = null;
}

try {
  DocumentConfiguration = require('../models/tenant/DocumentConfiguration');
} catch (e) {
  DocumentConfiguration = null;
}

// Import HR Activity History model
let HRActivityHistory;
try {
  HRActivityHistory = require('../models/tenant/HRActivityHistory');
} catch (e) {
  HRActivityHistory = null;
}

/**
 * Get tenant-specific models using the tenant's database connection
 * @param {mongoose.Connection} tenantConnection - Tenant database connection
 * @returns {Object} - Object containing all tenant-specific models
 */
function getTenantModels(tenantConnection) {
  // Cache models per connection to avoid re-compilation
  if (tenantConnection._tenantModels) {
    return tenantConnection._tenantModels;
  }

  const models = {};
  
  // Helper function to safely create tenant model
  const createTenantModel = (modelName, originalModel) => {
    try {
      // Check if originalModel is already a schema (for tenant-specific models)
      let schema;
      if (originalModel instanceof mongoose.Schema) {
        schema = originalModel;
      } else if (originalModel.jobPostingSchema) {
        // Special case for JobPosting which exports schema separately
        schema = originalModel.jobPostingSchema;
      } else if (originalModel.schema) {
        schema = originalModel.schema;
      } else if (originalModel.prototype && originalModel.prototype.schema) {
        schema = originalModel.prototype.schema;
      }
      
      if (schema) {
        // Check if model already exists to avoid "Cannot overwrite model" error
        if (tenantConnection.models[modelName]) {
          return tenantConnection.models[modelName];
        }
        return tenantConnection.model(modelName, schema);
      } else {
        console.warn(`⚠️ No schema found for ${modelName}, skipping tenant model creation`);
        return null;
      }
    } catch (error) {
      // If model already exists, return it
      if (error.message.includes('Cannot overwrite') && tenantConnection.models[modelName]) {
        return tenantConnection.models[modelName];
      }
      console.warn(`⚠️ Failed to create tenant model for ${modelName}:`, error.message);
      return null;
    }
  };

  // Core models
  models.Employee = createTenantModel('Employee', Employee);
  models.Department = createTenantModel('Department', Department);
  models.Leave = createTenantModel('Leave', Leave);
  models.Attendance = createTenantModel('Attendance', Attendance);
  models.Payroll = createTenantModel('Payroll', Payroll);
  models.Asset = createTenantModel('Asset', Asset);
  models.JobPosting = createTenantModel('JobPosting', JobPosting);
  models.Onboarding = createTenantModel('Onboarding', Onboarding);
  models.Offboarding = createTenantModel('Offboarding', Offboarding);
  models.Client = createTenantModel('Client', Client);
  models.Project = createTenantModel('Project', Project);
  models.TeamMeeting = createTenantModel('TeamMeeting', TeamMeeting);
  models.Timesheet = createTenantModel('Timesheet', Timesheet);
  models.Document = createTenantModel('Document', Document);
  models.Compliance = createTenantModel('Compliance', Compliance);
  models.Candidate = createTenantModel('Candidate', Candidate);
  models.Feedback = createTenantModel('Feedback', Feedback);
  models.Notification = createTenantModel('Notification', Notification);
  models.ExitProcess = createTenantModel('ExitProcess', ExitProcess);
  models.TalentPool = createTenantModel('TalentPool', TalentPool);
  models.OfferTemplate = createTenantModel('OfferTemplate', OfferTemplate);
  models.AgreementTemplate = createTenantModel('AgreementTemplate', AgreementTemplate);
  models.ResumePool = createTenantModel('ResumePool', ResumePool);
  models.JobDescription = createTenantModel('JobDescription', JobDescription);
  
  // Tenant-specific models
  models.TenantUser = createTenantModel('TenantUser', TenantUser);

  // Tenant-specific offboarding models (only if they exist)
  if (OffboardingRequest) models.OffboardingRequest = createTenantModel('OffboardingRequest', OffboardingRequest);
  if (OffboardingTask) models.OffboardingTask = createTenantModel('OffboardingTask', OffboardingTask);
  if (HandoverDetail) models.HandoverDetail = createTenantModel('HandoverDetail', HandoverDetail);
  if (AssetClearance) models.AssetClearance = createTenantModel('AssetClearance', AssetClearance);
  if (FinalSettlement) models.FinalSettlement = createTenantModel('FinalSettlement', FinalSettlement);
  if (ExitFeedback) models.ExitFeedback = createTenantModel('ExitFeedback', ExitFeedback);

  // Tenant-specific document upload models
  if (CandidateDocumentUploadToken) models.CandidateDocumentUploadToken = createTenantModel('CandidateDocumentUploadToken', CandidateDocumentUploadToken);
  if (CandidateDocument) models.CandidateDocument = createTenantModel('CandidateDocument', CandidateDocument);
  if (DocumentConfiguration) models.DocumentConfiguration = createTenantModel('DocumentConfiguration', DocumentConfiguration);

  // HR Activity History model
  if (HRActivityHistory) models.HRActivityHistory = createTenantModel('HRActivityHistory', HRActivityHistory);

  // Cache models on connection
  tenantConnection._tenantModels = models;
  
  return models;
}

/**
 * Get a specific tenant model
 * @param {mongoose.Connection} tenantConnection - Tenant database connection
 * @param {string} modelName - Name of the model to retrieve
 * @returns {mongoose.Model} - Tenant-specific model
 */
function getTenantModel(tenantConnection, modelName) {
  const models = getTenantModels(tenantConnection);
  return models[modelName];
}

module.exports = {
  getTenantModels,
  getTenantModel
};
