const express = require('express');
const router = express.Router();
const {
  getOfferTemplates,
  getOfferTemplate,
  createOfferTemplate,
  updateOfferTemplate,
  deleteOfferTemplate,
  updateTemplateStatus,
  previewTemplate,
  getDefaultTemplate
} = require('../controllers/offerTemplateController');
const { protect, authorize } = require('../middlewares/auth');

// All routes require authentication and HR/Admin role
router.use(protect);
router.use(authorize('admin', 'hr'));

// Template CRUD routes
router.route('/')
  .get(getOfferTemplates)
  .post(createOfferTemplate);

// Get default template for category
router.get('/default/:category', getDefaultTemplate);

// Template-specific routes
router.route('/:id')
  .get(getOfferTemplate)
  .put(updateOfferTemplate)
  .delete(deleteOfferTemplate);

// Template status management
router.put('/:id/status', updateTemplateStatus);

// Template preview
router.post('/:id/preview', previewTemplate);

module.exports = router;
