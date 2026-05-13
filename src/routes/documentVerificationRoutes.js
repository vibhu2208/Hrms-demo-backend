/**
 * Document Verification Routes
 * HR/Admin routes for verifying candidate documents
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { tenantMiddleware } = require('../middlewares/tenantMiddleware');
const {
  generateUploadToken,
  getCandidatesWithDocuments,
  getCandidateDocuments,
  verifyDocument,
  unverifyDocument,
  bulkVerifyDocuments,
  downloadDocument,
  getDocumentViewUrl,
  getVerificationStats
} = require('../controllers/documentVerificationController');
const { generateUploadToken: generateToken } = require('../controllers/publicDocumentUploadController');

// Apply authentication and tenant middleware
router.use(protect);
router.use(tenantMiddleware);

// Generate upload token for onboarding
router.post('/generate-token/:onboardingId', generateToken);

// Get all candidates with documents
router.get('/candidates', getCandidatesWithDocuments);

// Get documents for specific candidate
router.get('/candidates/:onboardingId/documents', getCandidateDocuments);

// Verify document
router.put('/documents/:documentId/verify', verifyDocument);

// Mark document as unverified (triggers re-submission)
router.put('/documents/:documentId/unverify', unverifyDocument);

// Bulk verify documents
router.post('/documents/bulk-verify', bulkVerifyDocuments);

// Download document
router.get('/documents/:documentId/download', downloadDocument);

// Get document view URL (for preview)
router.get('/documents/:documentId/view-url', getDocumentViewUrl);

// Get verification statistics
router.get('/stats', getVerificationStats);

module.exports = router;
