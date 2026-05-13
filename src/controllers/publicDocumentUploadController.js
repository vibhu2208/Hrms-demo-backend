/**
 * Public Document Upload Controller
 * Handles public-facing document upload portal for candidates
 */

const { getTenantModel } = require('../utils/tenantModels');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const s3Service = require('../services/awsS3Service');

const { getTenantConnection } = require('../config/database.config');

/**
 * Generate upload token for candidate
 * Called when onboarding is created or offer is sent
 */
exports.generateUploadToken = async (req, res) => {
  try {
    const { onboardingId } = req.params;
    const tenantConnection = req.tenant.connection;
    const tenantId = req.tenant.companyId || req.tenant.clientId;
    
    const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
    const CandidateDocumentUploadToken = getTenantModel(tenantConnection, 'CandidateDocumentUploadToken');
    
    // Find onboarding record
    const onboarding = await Onboarding.findById(onboardingId);
    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }
    
    // Check if active token already exists
    const existingToken = await CandidateDocumentUploadToken.findOne({
      onboardingId,
      isActive: true,
      revokedAt: null
    });
    
    if (existingToken) {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
      return res.status(200).json({
        success: true,
        message: 'Upload token already exists',
        data: {
          token: existingToken.token,
          uploadUrl: `${baseUrl}/public/upload-documents/${existingToken.token}?tenantId=${tenantId}`,
          expiresAt: existingToken.expiresAt
        }
      });
    }
    
    // Generate new token
    const token = CandidateDocumentUploadToken.schema.statics.generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days validity
    
    const uploadToken = await CandidateDocumentUploadToken.create({
      onboardingId: onboarding._id,
      candidateId: onboarding.onboardingId,
      candidateName: onboarding.candidateName,
      candidateEmail: onboarding.candidateEmail,
      position: onboarding.position,
      token,
      expiresAt,
      generatedBy: req.user._id
    });
    
    console.log(`✅ Upload token generated for ${onboarding.candidateName} (${onboarding.onboardingId})`);

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    res.status(201).json({
      success: true,
      message: 'Upload token generated successfully',
      data: {
        token: uploadToken.token,
        uploadUrl: `${baseUrl}/public/upload-documents/${uploadToken.token}?tenantId=${tenantId}`,
        expiresAt: uploadToken.expiresAt
      }
    });
  } catch (error) {
    console.error('Error generating upload token:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Validate upload token (public endpoint)
 */
exports.validateToken = async (req, res) => {
  try {
    const { token } = req.params;
    const { tenantId } = req.query;
    
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
    
    const tenantConnection = await getTenantConnection(tenantId);
    
    const CandidateDocumentUploadToken = getTenantModel(tenantConnection, 'CandidateDocumentUploadToken');
    const DocumentConfiguration = getTenantModel(tenantConnection, 'DocumentConfiguration');
    
    // Find token
    const uploadToken = await CandidateDocumentUploadToken.findOne({ token });
    
    if (!uploadToken) {
      return res.status(404).json({
        success: false,
        message: 'Invalid upload link'
      });
    }
    
    // Validate token
    if (!uploadToken.isValid()) {
      return res.status(400).json({
        success: false,
        message: uploadToken.revokedAt ? 'This upload link has been revoked' : 'This upload link has expired',
        expired: true
      });
    }
    
    // Record access
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    await uploadToken.recordAccess(ip, userAgent);
    
    // Get document configurations
    let documentConfigs = await DocumentConfiguration.find({ isActive: true })
      .sort({ displayOrder: 1 })
      .lean();
    
    // If no document configurations exist, use default ones
    if (!documentConfigs || documentConfigs.length === 0) {
      console.log('⚠️ No document configurations found, using defaults');
      const DocumentConfigSchema = require('../models/tenant/DocumentConfiguration');
      documentConfigs = DocumentConfigSchema.statics.getDefaultConfigurations();
    }
    
    // Get already uploaded documents
    const CandidateDocument = getTenantModel(tenantConnection, 'CandidateDocument');
    const uploadedDocuments = await CandidateDocument.find({
      onboardingId: uploadToken.onboardingId,
      isActive: true
    }).lean();
    
    res.status(200).json({
      success: true,
      data: {
        candidate: {
          candidateId: uploadToken.candidateId,
          name: uploadToken.candidateName,
          email: uploadToken.candidateEmail,
          position: uploadToken.position
        },
        documentConfigurations: documentConfigs,
        uploadedDocuments: uploadedDocuments.map(doc => ({
          documentType: doc.documentType,
          fileName: doc.originalFileName,
          uploadedAt: doc.uploadedAt,
          verificationStatus: doc.verificationStatus,
          unverificationReason: doc.unverificationReason
        })),
        resubmissionRequired: uploadToken.resubmissionRequired,
        rejectedDocuments: uploadToken.rejectedDocuments
      }
    });
  } catch (error) {
    console.error('Error validating token:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Upload document (public endpoint)
 */
exports.uploadDocument = async (req, res) => {
  try {
    const { token } = req.params;
    const { tenantId, documentType, originalDocumentId: originalDocumentIdFromClient } = req.body;
    
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    
    const tenantConnection = await getTenantConnection(tenantId);
    
    const CandidateDocumentUploadToken = getTenantModel(tenantConnection, 'CandidateDocumentUploadToken');
    const CandidateDocument = getTenantModel(tenantConnection, 'CandidateDocument');
    const DocumentConfiguration = getTenantModel(tenantConnection, 'DocumentConfiguration');
    const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
    
    // Validate token
    const uploadToken = await CandidateDocumentUploadToken.findOne({ token });
    
    if (!uploadToken || !uploadToken.isValid()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired upload link'
      });
    }
    
    // Validate document type
    let docConfig = await DocumentConfiguration.findOne({ documentType, isActive: true });
    
    // If not found in database, check default configurations
    if (!docConfig) {
      const DocumentConfigSchema = require('../models/tenant/DocumentConfiguration');
      const defaultConfigs = DocumentConfigSchema.statics.getDefaultConfigurations();
      docConfig = defaultConfigs.find(config => config.documentType === documentType);
      
      if (!docConfig) {
        return res.status(400).json({
          success: false,
          message: 'Invalid document type'
        });
      }
    }
    
    // Validate file format
    const fileExt = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    if (!docConfig.allowedFormats.includes(fileExt)) {
      return res.status(400).json({
        success: false,
        message: `Invalid file format. Allowed formats: ${docConfig.allowedFormats.join(', ')}`
      });
    }
    
    // Validate file size
    const fileSizeMB = req.file.size / (1024 * 1024);
    if (fileSizeMB > docConfig.maxFileSizeMB) {
      return res.status(400).json({
        success: false,
        message: `File size exceeds maximum allowed size of ${docConfig.maxFileSizeMB}MB`
      });
    }
    
    // Check if document already exists and mark as inactive
    // For certain document types (identity/bank docs) we only keep the latest active document.
    // For others (education, experience, training, other certifications), we allow multiple active uploads.
    const singleInstanceTypes = [
      'aadhaar_card',
      'pan_card',
      'photograph',
      'address_proof',
      'bank_details',
      'passport',
      'resume'
    ];
    
    let isResubmission = false;
    let originalDocumentId = null;
    
    // If a specific originalDocumentId is provided (for multi-document types),
    // treat this as a re-upload/overwrite of that particular document.
    if (originalDocumentIdFromClient) {
      const existingDoc = await CandidateDocument.findOne({
        _id: originalDocumentIdFromClient,
        onboardingId: uploadToken.onboardingId,
        documentType,
        isActive: true
      });

      if (existingDoc) {
        existingDoc.isActive = false;
        await existingDoc.save();
        isResubmission = true;
        originalDocumentId = existingDoc._id;
      }
    } else if (singleInstanceTypes.includes(documentType)) {
      const existingDoc = await CandidateDocument.findOne({
        onboardingId: uploadToken.onboardingId,
        documentType,
        isActive: true
      });
      
      if (existingDoc) {
        existingDoc.isActive = false;
        await existingDoc.save();
        isResubmission = true;
        originalDocumentId = existingDoc._id;
      }
    }
    
    // Upload to S3 with structured folder path
    const candidateFolder = `${s3Service.sanitizeForPath(uploadToken.candidateName)}-${uploadToken.candidateId}`;
    const s3Folder = `documents/${candidateFolder}`;
    
    let s3Result;
    try {
      s3Result = await s3Service.uploadFile(req.file, s3Folder);
    } catch (s3Error) {
      console.error('❌ S3 upload failed:', s3Error);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload file to cloud storage'
      });
    }

    // Create document record with S3 metadata
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    const document = await CandidateDocument.create({
      onboardingId: uploadToken.onboardingId,
      candidateEmail: uploadToken.candidateEmail,
      candidateName: uploadToken.candidateName,
      documentType,
      documentName: docConfig.displayName,
      fileName: req.file.originalname,
      originalFileName: req.file.originalname,
      filePath: s3Result.key,
      fileUrl: s3Result.url,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      storageProvider: 's3',
      s3Key: s3Result.key,
      s3Bucket: s3Result.bucket,
      uploadToken: token,
      uploadIp: ip,
      uploadUserAgent: userAgent,
      verificationStatus: isResubmission ? 'resubmitted' : 'pending',
      isResubmission,
      originalDocumentId,
      isMandatory: docConfig.isMandatory
    });
    
    // Add to history
    document.addToHistory('uploaded', null, uploadToken.candidateName, 
      isResubmission ? 'Document resubmitted' : 'Document uploaded', 
      { ip, userAgent });
    await document.save();
    
    // Update token
    if (!uploadToken.documentsSubmitted) {
      uploadToken.documentsSubmitted = true;
      uploadToken.firstSubmissionAt = new Date();
    }
    uploadToken.lastSubmissionAt = new Date();
    await uploadToken.save();

    try {
      const onboarding = await Onboarding.findById(uploadToken.onboardingId);
      if (onboarding) {
        const typeMap = {
          educational_certificate: 'education_certificates',
          aadhaar_card: 'aadhar',
          pan_card: 'pan',
          experience_letter: 'experience_letters',
          photograph: 'photo'
        };

        const onboardingDocType = typeMap[documentType] || documentType || 'other';

        const existingDocIndex = onboarding.documents.findIndex(doc => doc.type === onboardingDocType);
        const onboardingDoc = {
          type: onboardingDocType,
          name: docConfig.displayName,
          originalName: req.file.originalname,
          url: document.fileUrl,
          size: req.file.size,
          mimetype: req.file.mimetype,
          uploadedAt: document.uploadedAt,
          uploadedBy: 'candidate',
          status: 'uploaded',
          verified: false
        };

        if (existingDocIndex >= 0) {
          onboarding.documents[existingDocIndex] = onboardingDoc;
        } else {
          onboarding.documents.push(onboardingDoc);
        }

        const requiredDocIndex = onboarding.requiredDocuments.findIndex(doc => doc.type === onboardingDocType);
        if (requiredDocIndex >= 0) {
          onboarding.requiredDocuments[requiredDocIndex].submitted = true;
        }

        await onboarding.save();
      }
    } catch (syncError) {
      console.error('Error syncing uploaded document to onboarding record:', syncError);
    }
    
    console.log(`✅ Document uploaded: ${docConfig.displayName} by ${uploadToken.candidateName}`);
    
    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: {
        documentId: document._id,
        documentType: document.documentType,
        fileName: document.originalFileName,
        uploadedAt: document.uploadedAt,
        verificationStatus: document.verificationStatus
      }
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get uploaded documents for a token (public endpoint)
 */
exports.getUploadedDocuments = async (req, res) => {
  try {
    const { token } = req.params;
    const { tenantId } = req.query;
    
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }
    
    const tenantConnection = await getTenantConnection(tenantId);
    
    const CandidateDocumentUploadToken = getTenantModel(tenantConnection, 'CandidateDocumentUploadToken');
    const CandidateDocument = getTenantModel(tenantConnection, 'CandidateDocument');
    
    // Validate token
    const uploadToken = await CandidateDocumentUploadToken.findOne({ token });
    
    if (!uploadToken || !uploadToken.isValid()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired upload link'
      });
    }
    
    // Get documents
    const documents = await CandidateDocument.find({
      onboardingId: uploadToken.onboardingId,
      isActive: true
    })
    .sort({ uploadedAt: -1 })
    .lean();
    
    res.status(200).json({
      success: true,
      data: documents.map(doc => ({
        documentId: doc._id,
        documentType: doc.documentType,
        documentName: doc.documentName,
        fileName: doc.originalFileName,
        fileSize: doc.fileSize,
        uploadedAt: doc.uploadedAt,
        verificationStatus: doc.verificationStatus,
        unverificationReason: doc.unverificationReason,
        isResubmission: doc.isResubmission
      }))
    });
  } catch (error) {
    console.error('Error fetching uploaded documents:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = exports;
