const express = require('express');
const router = express.Router();
const {
  getTalentPool,
  getTalentPoolEntry,
  updateTalentStatus,
  moveToJob,
  deleteTalentPoolEntry
} = require('../controllers/talentPoolController');
const { protect, authorize } = require('../middlewares/auth');

// Protected routes - require authentication
router.use(protect);

router.route('/')
  .get(authorize('admin', 'hr'), getTalentPool);

router.route('/:id')
  .get(authorize('admin', 'hr'), getTalentPoolEntry)
  .delete(authorize('admin'), deleteTalentPoolEntry);

router.put('/:id/status', authorize('admin', 'hr'), updateTalentStatus);
router.post('/:id/move-to-job', authorize('admin', 'hr'), moveToJob);

module.exports = router;
