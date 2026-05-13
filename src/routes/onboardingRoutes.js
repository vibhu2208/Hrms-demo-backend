const express = require('express');
const router = express.Router();
const {
  getOnboardingList,
  getOnboarding,
  createOnboarding,
  updateOnboarding,
  advanceStage,
  setJoiningDate,
  addTask,
  completeTask,
  deleteOnboarding,
  completeOnboardingProcess,
  updateOnboardingStatus,
  sendOffer,
  acceptOffer,
  setJoiningDateAndNotify,
  uploadDocument,
  verifyDocument,
  getDocuments,
  requestDocumentResubmission,
  requestDocuments,
  // Onboarding Approval Routes
  requestOnboardingApproval,
  getOnboardingApprovalStatus,
  processOnboardingApproval,
  // Payslip verification routes
  requestPayslipUpload,
  verifyPayslip,
  // Agreement generation routes
  generateAgreement,
  getEmployeeAgreements
} = require('../controllers/onboardingController');
const { sendTestOnboardingEmail } = require('../controllers/testEmailController');
const { protect, authorize } = require('../middlewares/auth');
const { tenantMiddleware } = require('../middlewares/tenantMiddleware');

// Public routes (no authentication required)
router.post('/:id/accept-offer', acceptOffer);

// Protected routes
router.use(protect);
router.use(tenantMiddleware);
router.use(authorize('admin', 'hr', 'company_admin'));

router.route('/')
  .get(getOnboardingList)
  .post(createOnboarding);

// Legacy routes (keep for backward compatibility)
router.post('/:id/advance', advanceStage);
router.post('/:id/joining', setJoiningDate);
router.post('/:id/tasks', addTask);
router.put('/:id/tasks/:taskId/complete', completeTask);

// New comprehensive onboarding workflow routes
router.put('/:id/status', updateOnboardingStatus);
router.post('/:id/send-offer', sendOffer);
router.post('/:id/set-joining-date', setJoiningDateAndNotify);

// Onboarding Approval Routes - HR requests approval, Admin approves/rejects
router.post('/:id/request-approval', requestOnboardingApproval);
router.get('/:id/approval-status', getOnboardingApprovalStatus);
router.put('/:id/process-approval', processOnboardingApproval);

// Payslip verification routes
router.post('/:id/request-payslip-upload', requestPayslipUpload);
router.post('/:id/verify-payslip', verifyPayslip);

// Agreement generation routes
router.post('/:id/generate-agreement', generateAgreement);
router.get('/:id/agreements', getEmployeeAgreements);

// Document management routes
router.get('/:id/documents', getDocuments);
router.post('/:id/documents', uploadDocument);
router.put('/:id/documents/:docId/verify', verifyDocument);
router.post('/:id/documents/:docId/request-resubmission', requestDocumentResubmission);
router.post('/:id/request-documents', requestDocuments);

// Complete onboarding and create employee account
router.post('/:id/complete', completeOnboardingProcess);

// Test email endpoint
router.post('/:onboardingId/send-test-email', sendTestOnboardingEmail);

router.route('/:id')
  .get(getOnboarding)
  .put(updateOnboarding)
  .delete(deleteOnboarding);

module.exports = router;