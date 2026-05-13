const express = require('express');
const { protect } = require('../../middlewares/auth');
const { tenantMiddleware } = require('../../middlewares/tenantMiddleware');
const {
  getWeekTimesheet,
  upsertEntries,
  submitWeek,
  managerQueue,
  lockPeriod,
  adminUnlock,
  getTimesheetDetail,
  approveWholeWeek,
  sendBackDay
} = require('../../modules/timesheet/controllers/timesheetController');

const router = express.Router();
router.use(protect);
router.use(tenantMiddleware);

router.get('/week', getWeekTimesheet);
router.post('/entries', upsertEntries);
router.patch('/:id/submit', submitWeek);
router.get('/manager/queue', managerQueue);
router.get('/:id/detail', getTimesheetDetail);
router.patch('/:id/approve-week', approveWholeWeek);
router.patch('/:id/send-back-day', sendBackDay);
router.patch('/:id/lock', lockPeriod);
router.patch('/:id/unlock', adminUnlock);

module.exports = router;
