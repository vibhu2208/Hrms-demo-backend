const express = require('express');
const router = express.Router();
const {
  getJobPostings,
  getJobPosting,
  createJobPosting,
  updateJobPosting,
  publishJobPosting,
  closeJobPosting,
  updateJobStatus,
  deleteJobPosting,
  getJobApplicants
} = require('../controllers/jobPostingController');
const { protect, authorize } = require('../middlewares/auth');
const { tenantMiddleware } = require('../middlewares/tenantMiddleware');

router.use(protect);
router.use(tenantMiddleware);

router.route('/')
  .get(getJobPostings)
  .post(authorize('admin', 'hr', 'company_admin'), createJobPosting);

router.put('/:id/publish', authorize('admin', 'hr', 'company_admin'), publishJobPosting);
router.put('/:id/close', authorize('admin', 'hr', 'company_admin'), closeJobPosting);
router.put('/:id/status', authorize('admin', 'hr', 'company_admin'), updateJobStatus);
router.get('/:id/applicants', getJobApplicants);

router.route('/:id')
  .get(getJobPosting)
  .put(authorize('admin', 'hr', 'company_admin'), updateJobPosting)
  .delete(authorize('admin', 'company_admin'), deleteJobPosting);

module.exports = router;
