const express = require('express');
const { protect } = require('../../middlewares/auth');
const { tenantMiddleware } = require('../../middlewares/tenantMiddleware');
const { upsertEntries } = require('../../modules/timesheet/controllers/timesheetController');

const router = express.Router();
router.use(protect);
router.use(tenantMiddleware);

router.post('/', upsertEntries);

module.exports = router;
