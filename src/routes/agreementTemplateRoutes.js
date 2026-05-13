const express = require('express');
const router = express.Router();

const {
  getAgreementTemplates,
  getAgreementTemplate,
  createAgreementTemplate,
  updateAgreementTemplate,
  deleteAgreementTemplate,
  duplicateAgreementTemplate,
  getDefaultAgreementTemplate,
  previewAgreementTemplate
} = require('../controllers/agreementTemplateController');

const { protect, authorize } = require('../middlewares/auth');
const { tenantMiddleware } = require('../middlewares/tenantMiddleware');

// Apply middleware to all routes
router.use(protect);
router.use(tenantMiddleware);
router.use(authorize('admin', 'hr', 'company_admin'));

// Routes
router.route('/')
  .get(getAgreementTemplates)
  .post(createAgreementTemplate);

router.route('/:id')
  .get(getAgreementTemplate)
  .put(updateAgreementTemplate)
  .delete(deleteAgreementTemplate);

router.post('/:id/duplicate', duplicateAgreementTemplate);
router.get('/default/:category', getDefaultAgreementTemplate);
router.post('/:id/preview', previewAgreementTemplate);

module.exports = router;
