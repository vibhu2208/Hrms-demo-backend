/**
 * Public Document Upload Routes
 * Public-facing routes for candidate document uploads (no authentication required)
 */

const express = require('express');
const router = express.Router();
const upload = require('../config/multerMemoryConfig');
const {
  validateToken,
  uploadDocument,
  getUploadedDocuments
} = require('../controllers/publicDocumentUploadController');

// Public routes - no authentication required
// Validate upload token
router.get('/validate/:token', validateToken);

// Upload document
router.post('/upload/:token', upload.single('document'), uploadDocument);

// Get uploaded documents for a token
router.get('/documents/:token', getUploadedDocuments);

module.exports = router;
