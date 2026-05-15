const express = require('express');
const { protect } = require('../../middlewares/auth');
const { tenantMiddleware } = require('../../middlewares/tenantMiddleware');
const {
  applyLeave,
  myLeaveHistory,
  withdrawLeave,
  managerLeaveQueue,
  managerTeamLeaveCalendar,
  managerActionLeave,
  adminLeaveOverview,
  adminEscalationInbox,
  adminOverride
} = require('../../modules/leave/controllers/leaveController');

const router = express.Router();
router.use(protect);
router.use(tenantMiddleware);

router.get('/history', myLeaveHistory);
router.post('/', applyLeave);
router.patch('/:id/withdraw', withdrawLeave);
router.get('/manager/queue', managerLeaveQueue);
router.get('/manager/team-calendar', managerTeamLeaveCalendar);
router.patch('/:id/action', managerActionLeave);
router.get('/admin/overview', adminLeaveOverview);
router.get('/admin/escalations', adminEscalationInbox);
router.patch('/:id/override', adminOverride);

module.exports = router;
