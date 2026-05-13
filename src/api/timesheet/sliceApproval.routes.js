const express = require('express');
const { protect } = require('../../middlewares/auth');
const { tenantMiddleware } = require('../../middlewares/tenantMiddleware');
const { sliceAction } = require('../../modules/timesheet/controllers/timesheetController');

const router = express.Router();
router.use(protect);
router.use(tenantMiddleware);

router.patch('/:id/action', sliceAction);

module.exports = router;
