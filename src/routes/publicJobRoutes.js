const express = require('express');
const router = express.Router();
const {
  getPublicJobs,
  getPublicJob,
  submitApplication,
  getJobStats
} = require('../controllers/publicJobController');
const { submitToTalentPool } = require('../controllers/talentPoolController');
const { uploadResumeToS3, handleUploadError } = require('../middlewares/s3Upload');

// Public routes - no authentication required
router.get('/stats', getJobStats);
router.get('/', getPublicJobs);
router.get('/:id', getPublicJob);

// Test endpoint
router.post('/test', (req, res) => {
  console.log('Test endpoint hit');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  res.json({ success: true, message: 'Test endpoint working', body: req.body });
});
// Job application route with S3 file upload middleware
router.post('/:id/apply', (req, res, next) => {
  console.log('Route hit:', req.params.id);
  console.log('Content-Type:', req.headers['content-type']);
  next();
}, uploadResumeToS3, handleUploadError, submitApplication);

// Talent pool submission (public)
router.post('/talent-pool/submit', submitToTalentPool);

module.exports = router;
