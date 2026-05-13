/**
 * Contract Management Routes
 */

const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const { protect, authorize } = require('../middlewares/auth');
const { tenantMiddleware } = require('../middlewares/tenantMiddleware');

// All routes require authentication and tenant context
router.use(protect);
router.use(tenantMiddleware);

// Contract CRUD operations
router.post('/', contractController.createContract);
router.get('/', contractController.getContracts);
router.get('/stats', authorize('admin', 'company_admin'), contractController.getContractStats);
router.get('/:id', contractController.getContractById);
router.put('/:id', contractController.updateContract);

// Contract approval workflow
router.post('/:id/approve', contractController.approveContract);
router.post('/:id/reject', contractController.rejectContract);

// Contract lifecycle operations
router.post('/:id/renew', contractController.renewContract);
router.post('/:id/terminate', contractController.terminateContract);

// Contract-specific operations
router.put('/:id/deliverables/:deliverableIndex', contractController.updateDeliverable);
router.post('/:id/hours', contractController.updateHours);

module.exports = router;
