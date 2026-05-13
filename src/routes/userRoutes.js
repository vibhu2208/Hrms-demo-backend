const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');
const { tenantMiddleware } = require('../middlewares/tenantMiddleware');
const {
  getThemePreference,
  updateThemePreference,
  getUserProfile,
  getAllUsers,
  createUser,
  updateUserStatus,
  deleteUser
} = require('../controllers/userController');

// All routes are protected
router.use(protect);
router.use(tenantMiddleware);

// Theme preference routes
router.get('/theme', getThemePreference);
router.put('/theme', updateThemePreference);

// User profile route
router.get('/profile', getUserProfile);

// Admin and Company Admin - Get all users for current tenant
router.get('/all', authorize('admin', 'company_admin', 'manager', 'hr'), getAllUsers);

// Admin and Company Admin - Create new user
router.post('/create', authorize('admin', 'company_admin'), createUser);

// Admin and Company Admin - Update user status
router.put('/:id/status', authorize('admin', 'company_admin'), updateUserStatus);

// Admin and Company Admin - Delete user
router.delete('/:id', authorize('admin', 'company_admin'), deleteUser);

module.exports = router;
