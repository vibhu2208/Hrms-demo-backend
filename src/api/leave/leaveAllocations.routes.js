const express = require('express');
const { protect } = require('../../middlewares/auth');
const { tenantMiddleware } = require('../../middlewares/tenantMiddleware');
const {
  bulkAllocateLeaves,
  overrideAllocation,
  myLeaveBalances,
  adminLeaveAllocationsSummary,
  adminRecentAllocations
} = require('../../modules/leave/controllers/leaveController');

const router = express.Router();
router.use(protect);
router.use(tenantMiddleware);

router.get('/me', myLeaveBalances);
router.get('/summary', adminLeaveAllocationsSummary);
router.get('/recent', adminRecentAllocations);
router.post('/bulk', bulkAllocateLeaves);
router.patch('/:id/override', overrideAllocation);

module.exports = router;
