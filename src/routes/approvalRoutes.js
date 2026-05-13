const express = require('express');
const router = express.Router();
const {
  getMyPendingApprovals,
  getApprovalHistory,
  approveRequest,
  rejectRequest,
  getApprovalStats
} = require('../controllers/approvalController');
const { protect } = require('../middlewares/auth');
const { tenantMiddleware } = require('../middlewares/tenantMiddleware');

// All routes require authentication and tenant context
router.use(protect);
router.use(tenantMiddleware);

// Get my pending approvals
router.get('/pending', getMyPendingApprovals);

// Get approval statistics
router.get('/stats', getApprovalStats);

// Get approval history for a specific request
router.get('/history/:requestType/:requestId', getApprovalHistory);

// Approve a request
router.put('/:id/approve', approveRequest);

// Reject a request
router.put('/:id/reject', rejectRequest);

module.exports = router;
