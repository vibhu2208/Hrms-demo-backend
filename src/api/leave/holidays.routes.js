const express = require('express');
const { protect } = require('../../middlewares/auth');
const { tenantMiddleware } = require('../../middlewares/tenantMiddleware');
const { createHoliday, listHolidays, deleteHoliday } = require('../../modules/leave/controllers/leaveController');

const router = express.Router();
router.use(protect);
router.use(tenantMiddleware);

router.get('/', listHolidays);
router.post('/', createHoliday);
router.delete('/:id', deleteHoliday);

module.exports = router;
