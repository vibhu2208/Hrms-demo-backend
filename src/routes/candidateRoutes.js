const express = require('express');
const router = express.Router();
const {
  getCandidates,
  getCandidate,
  createCandidate,
  updateCandidate,
  updateStage,
  moveToStage,
  scheduleInterview,
  convertToEmployee,
  moveToOnboarding,
  deleteCandidate,
  updateInterviewFeedback,
  sendNotification,
  updateHRCall,
  getCandidateTimeline,
  sendInterviewEmail,
  checkDuplicate,
  getCandidateHistory,
  getCandidateByEmail,
  uploadResume: uploadResumeController,
  searchCandidatesByJD,
  getCandidatePoolForJD,
  compareCandidatesForJD,
  fixExEmployeeCandidateNames,
  cleanupDuplicateExEmployeeCandidates,
  moveCandidateToSection,
  getJobPostingsForCandidateMove
} = require('../controllers/candidateController');
const {
  validateBulkUpload,
  importBulkCandidates,
  downloadTemplate
} = require('../controllers/candidateBulkUploadController');
const { uploadBulk, uploadResume } = require('../middlewares/fileUpload');
const { uploadResumeToS3, handleUploadError: handleS3UploadError } = require('../middlewares/s3Upload');
const { sendToOnboarding } = require('../controllers/onboardingController');
const { protect, authorize } = require('../middlewares/auth');
const { tenantMiddleware } = require('../middlewares/tenantMiddleware');

router.use(protect);
router.use(tenantMiddleware);
router.use(authorize('admin', 'hr', 'company_admin'));

router.route('/')
  .get(getCandidates)
  .post(createCandidate);

// Job application route with file upload support
router.post('/apply', uploadResume, createCandidate);

// Check for duplicate candidate
router.get('/check-duplicate', checkDuplicate);

// Get job postings for candidate movement (MUST be before /:id routes)
router.get('/job-postings-for-move', getJobPostingsForCandidateMove);

// Get candidate history
router.get('/:id/history', getCandidateHistory);

// Get all applications by email
router.get('/by-email/:email', getCandidateByEmail);

router.put('/:id/stage', updateStage);
router.post('/:id/move-to-stage', moveToStage);
router.post('/:id/interview', scheduleInterview);
router.post('/:id/convert', convertToEmployee);
router.post('/:id/onboarding', moveToOnboarding);

// Move candidate to different sections (comprehensive endpoint)
router.post('/:id/move-to-section', moveCandidateToSection);

// New comprehensive onboarding flow
router.post('/:id/send-to-onboarding', sendToOnboarding);

// New timeline and notification routes
router.get('/:id/timeline', getCandidateTimeline);
router.put('/:candidateId/interview/:interviewId/feedback', updateInterviewFeedback);
router.post('/:id/notification', sendNotification);
router.put('/:id/hr-call', updateHRCall);

// JD-based candidate search routes (must come before /:id routes)
router.get('/search-by-jd', (req, res, next) => {
  console.log('🔍 Route /search-by-jd hit with query:', req.query);
  return searchCandidatesByJD(req, res, next);
});
router.get('/pool-for-jd/:jdId', getCandidatePoolForJD);
router.post('/compare-for-jd/:jdId', compareCandidatesForJD);

// Send interview notification email
router.post('/:id/send-interview-email', sendInterviewEmail);

router.route('/:id')
  .get(getCandidate)
  .put(updateCandidate)
  .delete(deleteCandidate);

// Bulk upload routes
router.post('/bulk/validate', uploadBulk.single('file'), validateBulkUpload);
router.post('/bulk/import', importBulkCandidates);
router.get('/bulk/template', downloadTemplate);

// Resume upload and parsing route (S3 enabled)
router.post('/upload-resume', uploadResumeToS3, handleS3UploadError, uploadResumeController);

// Fix ex-employee candidate names
router.post('/fix-ex-employee-names', fixExEmployeeCandidateNames);

// Cleanup duplicate ex-employee candidates
router.post('/cleanup-duplicates', cleanupDuplicateExEmployeeCandidates);

module.exports = router;
