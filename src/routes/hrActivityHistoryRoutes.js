const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');
const { tenantMiddleware } = require('../middlewares/tenantMiddleware');
const {
  getHRActivityHistory,
  getHRUserActivity,
  getHRActivityStats
} = require('../controllers/hrActivityHistoryController');

// All routes are protected. Managers can access scoped HR audits.
router.use(protect);
router.use(tenantMiddleware);
router.use(authorize('admin', 'company_admin', 'manager'));

// Get all HR activity history
router.get('/', getHRActivityHistory);

// Get activity statistics
router.get('/stats', getHRActivityStats);

// Get activity history for specific HR user
router.get('/hr/:hrUserId', getHRUserActivity);

// Test endpoint to verify logging is working
router.post('/test-log', async (req, res) => {
  try {
    const tenantConnection = req.tenant.connection;
    const { logSendToOnboarding } = require('../services/hrActivityLogService');

    // Create a test candidate and onboarding object
    const testCandidate = {
      firstName: 'Test',
      lastName: 'Candidate',
      email: 'test@example.com'
    };

    const testOnboarding = {
      _id: '507f1f77bcf86cd799439011',
      onboardingId: 'TEST-001',
      position: 'Test Position'
    };

    await logSendToOnboarding(tenantConnection, testCandidate, testOnboarding, req);

    res.status(200).json({
      success: true,
      message: 'Test HR activity log created successfully'
    });
  } catch (error) {
    console.error('Error creating test log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create test log',
      error: error.message
    });
  }
});

module.exports = router;
