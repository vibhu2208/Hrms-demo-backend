const express = require('express');
const { protect } = require('../../middlewares/auth');
const { tenantMiddleware } = require('../../middlewares/tenantMiddleware');
const { bulkUploadPreview, bulkUploadCommit } = require('../../modules/timesheet/controllers/timesheetController');

const router = express.Router();
router.use(protect);
router.use(tenantMiddleware);

router.post('/preview', bulkUploadPreview);
router.post('/commit', bulkUploadCommit);

module.exports = router;
