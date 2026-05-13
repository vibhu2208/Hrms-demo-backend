const express = require('express');
const { protect } = require('../../middlewares/auth');
const { tenantMiddleware } = require('../../middlewares/tenantMiddleware');
const { bulkAllocateLeaves, overrideAllocation, myLeaveBalances } = require('../../modules/leave/controllers/leaveController');

const router = express.Router();
router.use(protect);
router.use(tenantMiddleware);

router.get('/me', myLeaveBalances);
router.post('/bulk', bulkAllocateLeaves);
router.patch('/:id/override', overrideAllocation);

module.exports = router;
