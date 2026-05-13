/**
 * Document Verification Controller
 * HR/Admin panel for verifying candidate documents
 */

const { getTenantModel } = require('../utils/tenantModels');
const { sendDocumentRejectionEmail } = require('../services/emailService');

/**
 * Get all candidates with pending document verification
 */
exports.getCandidatesWithDocuments = async (req, res) => {
  try {
    const tenantConnection = req.tenant.connection;
    const { status } = req.query;
    
    const CandidateDocument = getTenantModel(tenantConnection, 'CandidateDocument');
    const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
    
    // Get unique onboarding IDs with documents
    const pipeline = [
      { $match: { isActive: true } }
    ];
    
    if (status) {
      pipeline[0].$match.verificationStatus = status;
    }
    
    pipeline.push(
      {
        $group: {
          _id: '$onboardingId',
          totalDocuments: { $sum: 1 },
          pendingDocuments: {
            $sum: { $cond: [{ $eq: ['$verificationStatus', 'pending'] }, 1, 0] }
          },
          verifiedDocuments: {
            $sum: { $cond: [{ $eq: ['$verificationStatus', 'verified'] }, 1, 0] }
          },
          unverifiedDocuments: {
            $sum: { $cond: [{ $eq: ['$verificationStatus', 'unverified'] }, 1, 0] }
          },
          resubmittedDocuments: {
            $sum: { $cond: [{ $eq: ['$verificationStatus', 'resubmitted'] }, 1, 0] }
          },
          lastUploadedAt: { $max: '$uploadedAt' }
        }
      },
      { $sort: { lastUploadedAt: -1 } }
    );
    
    const documentStats = await CandidateDocument.aggregate(pipeline);
    
    // Get onboarding details
    const onboardingIds = documentStats.map(stat => stat._id);
    const onboardings = await Onboarding.find({ _id: { $in: onboardingIds } })
      .select('onboardingId candidateName candidateEmail position department status')
      .lean();
    
    // Merge data
    const candidates = documentStats.map(stat => {
      const onboarding = onboardings.find(o => o._id.toString() === stat._id.toString());
      return {
        onboardingId: stat._id,
        candidateId: onboarding?.onboardingId,
        candidateName: onboarding?.candidateName,
        candidateEmail: onboarding?.candidateEmail,
        position: onboarding?.position,
        department: onboarding?.department,
        onboardingStatus: onboarding?.status,
        documentStats: {
          total: stat.totalDocuments,
          pending: stat.pendingDocuments,
          verified: stat.verifiedDocuments,
          unverified: stat.unverifiedDocuments,
          resubmitted: stat.resubmittedDocuments
        },
        lastUploadedAt: stat.lastUploadedAt
      };
    });
    
    res.status(200).json({
      success: true,
      count: candidates.length,
      data: candidates
    });
  } catch (error) {
    console.error('Error fetching candidates with documents:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get documents for a specific candidate
 */
exports.getCandidateDocuments = async (req, res) => {
  try {
    const { onboardingId } = req.params;
    const tenantConnection = req.tenant.connection;
    
    const CandidateDocument = getTenantModel(tenantConnection, 'CandidateDocument');
    const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
    const DocumentConfiguration = getTenantModel(tenantConnection, 'DocumentConfiguration');
    
    // Get onboarding details
    const onboarding = await Onboarding.findById(onboardingId);
    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }
    
    // Get documents
    const documents = await CandidateDocument.find({
      onboardingId,
      isActive: true
    })
    .sort({ uploadedAt: -1 })
    .lean();
    
    // Get document configurations
    const docConfigs = await DocumentConfiguration.find({ isActive: true })
      .sort({ displayOrder: 1 })
      .lean();
    
    res.status(200).json({
      success: true,
      data: {
        candidate: {
          onboardingId: onboarding._id,
          candidateId: onboarding.onboardingId,
          candidateName: onboarding.candidateName,
          candidateEmail: onboarding.candidateEmail,
          position: onboarding.position,
          department: onboarding.department
        },
        documents,
        documentConfigurations: docConfigs
      }
    });
  } catch (error) {
    console.error('Error fetching candidate documents:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Verify a document
 */
exports.verifyDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const { remarks } = req.body;
    const tenantConnection = req.tenant.connection;
    
    const CandidateDocument = getTenantModel(tenantConnection, 'CandidateDocument');
    
    const document = await CandidateDocument.findById(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }
    
    // Update verification status
    document.verificationStatus = 'verified';
    document.verifiedBy = req.user._id;
    document.verifiedByName = `${req.user.firstName} ${req.user.lastName}`;
    document.verifiedAt = new Date();
    document.verificationRemarks = remarks;
    
    // Add to history
    document.addToHistory('verified', req.user._id, document.verifiedByName, remarks);
    
    await document.save();
    
    // SYNC: Also update the Onboarding collection to keep both systems in sync
    try {
      const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
      const onboarding = await Onboarding.findById(document.onboardingId);
      
      if (onboarding) {
        // Map CandidateDocument types to onboarding document types
        const documentTypeMapping = {
          'aadhaar_card': 'aadhar',
          'pan_card': 'pan',
          'educational_certificate': 'education_certificates',
          'experience_letter': 'experience_letters',
          'photograph': 'photo',
          'resume': 'resume',
          'bank_details': 'bank_details',
          'passport': 'passport',
          'address_proof': 'address_proof',
          'other': 'other'
        };
        
        const mappedDocType = documentTypeMapping[document.documentType] || document.documentType;
        
        // Find the document in the onboarding documents array using multiple criteria
        let onboardingDoc = onboarding.documents.find(doc => 
          doc.type === mappedDocType || doc.name === document.documentName
        );
        
        // If not found by mapped type, try original type
        if (!onboardingDoc) {
          onboardingDoc = onboarding.documents.find(doc => 
            doc.type === document.documentType || doc.name === document.documentName
          );
        }
        
        // If still not found, try by similar names (case insensitive)
        if (!onboardingDoc) {
          onboardingDoc = onboarding.documents.find(doc => 
            doc.name && document.documentName && 
            doc.name.toLowerCase().includes(document.documentName.toLowerCase()) ||
            document.documentName.toLowerCase().includes(doc.name.toLowerCase())
          );
        }
        
        if (onboardingDoc) {
          onboardingDoc.verified = true;
          onboardingDoc.verifiedBy = req.user._id;
          onboardingDoc.verifiedAt = new Date();
          onboardingDoc.verificationNotes = remarks;
          onboardingDoc.status = 'verified';
          
          // Update required documents checklist
          const requiredDocIndex = onboarding.requiredDocuments.findIndex(doc => 
            doc.type === mappedDocType || doc.type === document.documentType
          );
          if (requiredDocIndex >= 0) {
            onboarding.requiredDocuments[requiredDocIndex].verified = true;
          }
          
          // Add audit trail
          onboarding.auditTrail.push({
            action: 'document_approved',
            description: `Document approved: ${document.documentType}`,
            performedBy: req.user._id,
            metadata: { documentType: document.documentType, notes: remarks },
            timestamp: new Date()
          });
          
          // Check if all required documents are verified
          const allRequiredVerified = onboarding.requiredDocuments
            .filter(doc => doc.isRequired)
            .every(doc => doc.verified);

          if (allRequiredVerified && onboarding.status === 'docs_pending') {
            onboarding.status = 'docs_verified';
            onboarding.auditTrail.push({
              action: 'all_documents_verified',
              description: 'All required documents have been verified',
              performedBy: req.user._id,
              timestamp: new Date()
            });
          }
          
          await onboarding.save();
          console.log(`✅ Synced document verification to Onboarding collection: ${document.documentType}`);
        }
      }
    } catch (syncError) {
      console.error('❌ Failed to sync document verification to Onboarding collection:', syncError);
      // Don't fail the main operation if sync fails
    }
    
    console.log(`✅ Document verified: ${document.documentName} for ${document.candidateName}`);
    
    res.status(200).json({
      success: true,
      message: 'Document verified successfully',
      data: document
    });
  } catch (error) {
    console.error('Error verifying document:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Mark document as unverified and trigger re-submission
 */
exports.unverifyDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const { reason } = req.body;
    const tenantConnection = req.tenant.connection;
    
    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Reason is required when marking document as unverified'
      });
    }
    
    const CandidateDocument = getTenantModel(tenantConnection, 'CandidateDocument');
    const CandidateDocumentUploadToken = getTenantModel(tenantConnection, 'CandidateDocumentUploadToken');
    
    const document = await CandidateDocument.findById(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }
    
    // Update verification status
    document.verificationStatus = 'unverified';
    document.unverifiedBy = req.user._id;
    document.unverifiedByName = `${req.user.firstName} ${req.user.lastName}`;
    document.unverifiedAt = new Date();
    document.unverificationReason = reason;
    
    // Add to history
    document.addToHistory('unverified', req.user._id, document.unverifiedByName, reason);
    
    await document.save();
    
    // SYNC: Also update the Onboarding collection to keep both systems in sync
    try {
      const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
      const onboarding = await Onboarding.findById(document.onboardingId);
      
      if (onboarding) {
        // Map CandidateDocument types to onboarding document types
        const documentTypeMapping = {
          'aadhaar_card': 'aadhar',
          'pan_card': 'pan',
          'educational_certificate': 'education_certificates',
          'experience_letter': 'experience_letters',
          'photograph': 'photo',
          'resume': 'resume',
          'bank_details': 'bank_details',
          'passport': 'passport',
          'address_proof': 'address_proof',
          'other': 'other'
        };
        
        const mappedDocType = documentTypeMapping[document.documentType] || document.documentType;
        
        // Find the document in the onboarding documents array using multiple criteria
        let onboardingDoc = onboarding.documents.find(doc => 
          doc.type === mappedDocType || doc.name === document.documentName
        );
        
        // If not found by mapped type, try original type
        if (!onboardingDoc) {
          onboardingDoc = onboarding.documents.find(doc => 
            doc.type === document.documentType || doc.name === document.documentName
          );
        }
        
        // If still not found, try by similar names (case insensitive)
        if (!onboardingDoc) {
          onboardingDoc = onboarding.documents.find(doc => 
            doc.name && document.documentName && 
            doc.name.toLowerCase().includes(document.documentName.toLowerCase()) ||
            document.documentName.toLowerCase().includes(doc.name.toLowerCase())
          );
        }
        
        if (onboardingDoc) {
          onboardingDoc.verified = false;
          onboardingDoc.verifiedBy = req.user._id;
          onboardingDoc.verifiedAt = new Date();
          onboardingDoc.verificationNotes = reason;
          onboardingDoc.status = 'rejected';
          onboardingDoc.rejectionReason = reason;
          
          // Update required documents checklist
          const requiredDocIndex = onboarding.requiredDocuments.findIndex(doc => 
            doc.type === mappedDocType || doc.type === document.documentType
          );
          if (requiredDocIndex >= 0) {
            onboarding.requiredDocuments[requiredDocIndex].verified = false;
          }
          
          // Add audit trail
          onboarding.auditTrail.push({
            action: 'document_rejected',
            description: `Document rejected: ${document.documentType}`,
            performedBy: req.user._id,
            metadata: { documentType: document.documentType, notes: reason },
            timestamp: new Date()
          });
          
          await onboarding.save();
          console.log(`✅ Synced document rejection to Onboarding collection: ${document.documentType}`);
        }
      }
    } catch (syncError) {
      console.error('❌ Failed to sync document rejection to Onboarding collection:', syncError);
      // Don't fail the main operation if sync fails
    }
    
    // Update upload token to mark resubmission required
    const uploadToken = await CandidateDocumentUploadToken.findOne({
      onboardingId: document.onboardingId,
      isActive: true
    });
    
    if (uploadToken) {
      uploadToken.resubmissionRequired = true;
      uploadToken.resubmissionRequestedAt = new Date();
      
      // Add to rejected documents list
      const existingRejection = uploadToken.rejectedDocuments.find(
        rd => rd.documentType === document.documentType
      );
      
      if (existingRejection) {
        existingRejection.reason = reason;
        existingRejection.rejectedAt = new Date();
      } else {
        uploadToken.rejectedDocuments.push({
          documentType: document.documentType,
          reason,
          rejectedAt: new Date()
        });
      }
      
      await uploadToken.save();
      
      // Send re-submission email
      try {
        await sendDocumentRejectionEmail({
          candidateName: document.candidateName,
          candidateEmail: document.candidateEmail,
          documentName: document.documentName,
          rejectionReason: reason,
          // Hard-coded public upload URL as requested
          uploadUrl: `http://3.108.172.119/public/upload-documents/${uploadToken.token}`,
          rejectedDocuments: uploadToken.rejectedDocuments
        });
        
        console.log(`📧 Re-submission email sent to ${document.candidateEmail}`);
      } catch (emailError) {
        console.error('Error sending re-submission email:', emailError);
      }
    }
    
    console.log(`❌ Document marked unverified: ${document.documentName} for ${document.candidateName}`);
    
    res.status(200).json({
      success: true,
      message: 'Document marked as unverified. Re-submission email sent to candidate.',
      data: document
    });
  } catch (error) {
    console.error('Error marking document as unverified:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Bulk verify documents
 */
exports.bulkVerifyDocuments = async (req, res) => {
  try {
    const { documentIds, remarks } = req.body;
    const tenantConnection = req.tenant.connection;
    
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Document IDs array is required'
      });
    }
    
    const CandidateDocument = getTenantModel(tenantConnection, 'CandidateDocument');
    
    const verifierName = `${req.user.firstName} ${req.user.lastName}`;
    const verifiedAt = new Date();
    
    // Update all documents
    const result = await CandidateDocument.updateMany(
      { _id: { $in: documentIds }, isActive: true },
      {
        $set: {
          verificationStatus: 'verified',
          verifiedBy: req.user._id,
          verifiedByName: verifierName,
          verifiedAt,
          verificationRemarks: remarks
        },
        $push: {
          history: {
            action: 'verified',
            performedBy: req.user._id,
            performedByName: verifierName,
            remarks,
            timestamp: verifiedAt
          }
        }
      }
    );
    
    // SYNC: Also update the Onboarding collection for bulk verified documents
    try {
      const documents = await CandidateDocument.find({ 
        _id: { $in: documentIds }, 
        isActive: true 
      }).select('onboardingId documentType documentName');
      
      const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
      
      // Group documents by onboarding ID for efficient updates
      const onboardingUpdates = {};
      documents.forEach(doc => {
        if (!onboardingUpdates[doc.onboardingId]) {
          onboardingUpdates[doc.onboardingId] = [];
        }
        onboardingUpdates[doc.onboardingId].push(doc);
      });
      
      // Update each onboarding record
      for (const [onboardingId, docs] of Object.entries(onboardingUpdates)) {
        const onboarding = await Onboarding.findById(onboardingId);
        if (onboarding) {
          // Map CandidateDocument types to onboarding document types
          const documentTypeMapping = {
            'aadhaar_card': 'aadhar',
            'pan_card': 'pan',
            'educational_certificate': 'education_certificates',
            'experience_letter': 'experience_letters',
            'photograph': 'photo',
            'resume': 'resume',
            'bank_details': 'bank_details',
            'passport': 'passport',
            'address_proof': 'address_proof',
            'other': 'other'
          };
          
          docs.forEach(doc => {
            const mappedDocType = documentTypeMapping[doc.documentType] || doc.documentType;
            
            // Find the document in the onboarding documents array using multiple criteria
            let onboardingDoc = onboarding.documents.find(oDoc => 
              oDoc.type === mappedDocType || oDoc.name === doc.documentName
            );
            
            // If not found by mapped type, try original type
            if (!onboardingDoc) {
              onboardingDoc = onboarding.documents.find(oDoc => 
                oDoc.type === doc.documentType || oDoc.name === doc.documentName
              );
            }
            
            // If still not found, try by similar names (case insensitive)
            if (!onboardingDoc) {
              onboardingDoc = onboarding.documents.find(oDoc => 
                oDoc.name && doc.documentName && 
                oDoc.name.toLowerCase().includes(doc.documentName.toLowerCase()) ||
                doc.documentName.toLowerCase().includes(oDoc.name.toLowerCase())
              );
            }
            
            if (onboardingDoc) {
              onboardingDoc.verified = true;
              onboardingDoc.verifiedBy = req.user._id;
              onboardingDoc.verifiedAt = verifiedAt;
              onboardingDoc.verificationNotes = remarks;
              onboardingDoc.status = 'verified';
            }
            
            // Update required documents checklist
            const requiredDocIndex = onboarding.requiredDocuments.findIndex(rDoc => 
              rDoc.type === mappedDocType || rDoc.type === doc.documentType
            );
            if (requiredDocIndex >= 0) {
              onboarding.requiredDocuments[requiredDocIndex].verified = true;
            }
            
            // Add audit trail
            onboarding.auditTrail.push({
              action: 'document_approved',
              description: `Document bulk approved: ${doc.documentType}`,
              performedBy: req.user._id,
              metadata: { documentType: doc.documentType, notes: remarks },
              timestamp: verifiedAt
            });
          });
          
          // Check if all required documents are verified
          const allRequiredVerified = onboarding.requiredDocuments
            .filter(doc => doc.isRequired)
            .every(doc => doc.verified);

          if (allRequiredVerified && onboarding.status === 'docs_pending') {
            onboarding.status = 'docs_verified';
            onboarding.auditTrail.push({
              action: 'all_documents_verified',
              description: 'All required documents have been verified (bulk)',
              performedBy: req.user._id,
              timestamp: verifiedAt
            });
          }
          
          await onboarding.save();
        }
      }
      
      console.log(`✅ Synced bulk verification to Onboarding collection for ${documents.length} documents`);
    } catch (syncError) {
      console.error('❌ Failed to sync bulk verification to Onboarding collection:', syncError);
      // Don't fail the main operation if sync fails
    }
    
    console.log(`✅ Bulk verified ${result.modifiedCount} documents`);
    
    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} documents verified successfully`,
      data: {
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {
    console.error('Error bulk verifying documents:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Download document
 */
const path = require('path');
const fs = require('fs');
const s3Service = require('../services/awsS3Service');

exports.downloadDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const tenantConnection = req.tenant.connection;
    
    const CandidateDocument = getTenantModel(tenantConnection, 'CandidateDocument');
    
    const document = await CandidateDocument.findById(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Handle S3-stored files
    if (document.storageProvider === 's3' && document.s3Key) {
      try {
        // Stream S3 object to client
        const s3Object = await s3Service.s3.getObject({
          Bucket: document.s3Bucket,
          Key: document.s3Key
        }).promise();
        
        res.set({
          'Content-Type': s3Object.ContentType,
          'Content-Length': s3Object.ContentLength,
          'Content-Disposition': `attachment; filename="${document.originalFileName}"`
        });
        
        return res.send(s3Object.Body);
      } catch (s3Error) {
        console.error('❌ Failed to stream S3 object:', s3Error);
        return res.status(500).json({
          success: false,
          message: 'Failed to access file from cloud storage'
        });
      }
    }

    // Fallback to local file storage for backward compatibility
    const absolutePath = path.isAbsolute(document.filePath)
      ? document.filePath
      : path.join(__dirname, '..', '..', document.filePath);

    if (!fs.existsSync(absolutePath)) {
      console.error('Download error: file not found on disk', {
        filePath: document.filePath,
        resolvedPath: absolutePath
      });
      return res.status(404).json({
        success: false,
        message: 'File not found on server'
      });
    }

    res.download(absolutePath, document.originalFileName);
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get document view URL (signed URL for S3 or local path)
 */
exports.getDocumentViewUrl = async (req, res) => {
  try {
    const { documentId } = req.params;
    const tenantConnection = req.tenant.connection;
    
    const CandidateDocument = getTenantModel(tenantConnection, 'CandidateDocument');
    
    const document = await CandidateDocument.findById(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Handle S3-stored files
    if (document.storageProvider === 's3' && document.s3Key) {
      try {
        // Generate signed URL for viewing (inline disposition)
        const signedUrl = s3Service.generateSignedUrl(document.s3Key, 3600); // 1 hour expiry
        
        return res.status(200).json({
          success: true,
          data: {
            viewUrl: signedUrl,
            fileName: document.originalFileName,
            mimeType: document.mimeType
          }
        });
      } catch (s3Error) {
        console.error('❌ Failed to generate S3 signed URL:', s3Error);
        return res.status(500).json({
          success: false,
          message: 'Failed to access file from cloud storage'
        });
      }
    }

    // Fallback to local file storage for backward compatibility
    const absolutePath = path.isAbsolute(document.filePath)
      ? document.filePath
      : path.join(__dirname, '..', '..', document.filePath);

    if (!fs.existsSync(absolutePath)) {
      console.error('View error: file not found on disk', {
        filePath: document.filePath,
        resolvedPath: absolutePath
      });
      return res.status(404).json({
        success: false,
        message: 'File not found on server'
      });
    }

    // For local files, we'll need to serve them via a different endpoint
    // For now, return the file path (frontend will need to handle this)
    const backendBaseUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const viewUrl = `${backendBaseUrl}/document-verification/documents/${documentId}/view-local`;
    
    return res.status(200).json({
      success: true,
      data: {
        viewUrl,
        fileName: document.originalFileName,
        mimeType: document.mimeType
      }
    });
  } catch (error) {
    console.error('Error getting document view URL:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Get document verification statistics
 */
exports.getVerificationStats = async (req, res) => {
  try {
    const tenantConnection = req.tenant.connection;
    const CandidateDocument = getTenantModel(tenantConnection, 'CandidateDocument');
    
    const stats = await CandidateDocument.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$verificationStatus',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const statsObj = {
      total: 0,
      pending: 0,
      verified: 0,
      unverified: 0,
      resubmitted: 0
    };
    
    stats.forEach(stat => {
      statsObj[stat._id] = stat.count;
      statsObj.total += stat.count;
    });
    
    res.status(200).json({
      success: true,
      data: statsObj
    });
  } catch (error) {
    console.error('Error fetching verification stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = exports;
