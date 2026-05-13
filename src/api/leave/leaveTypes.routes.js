const express = require('express');
const { protect } = require('../../middlewares/auth');
const { tenantMiddleware } = require('../../middlewares/tenantMiddleware');
const { createLeaveType, listLeaveTypes, updateLeaveType } = require('../../modules/leave/controllers/leaveController');

const router = express.Router();
router.use(protect);
router.use(tenantMiddleware);

router.get('/', listLeaveTypes);
router.post('/', createLeaveType);
router.put('/:id', updateLeaveType);

module.exports = router;
