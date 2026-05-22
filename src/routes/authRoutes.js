const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');
const { tenantMiddleware } = require('../middlewares/tenantMiddleware');

// Load controller after middleware to avoid circular dependency partial exports
const {
  register,
  login,
  getMe,
  updatePassword,
  googleLogin,
  adminResetPassword,
  getActiveCompanies,
} = require('../controllers/authController');

const required = {
  register,
  login,
  getMe,
  updatePassword,
  googleLogin,
  adminResetPassword,
  getActiveCompanies,
};

for (const [name, handler] of Object.entries(required)) {
  if (typeof handler !== 'function') {
    throw new Error(`authController.${name} is not exported (got ${typeof handler})`);
  }
}

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);
router.get('/me', protect, getMe);
router.put('/updatepassword', protect, updatePassword);
router.get('/companies', getActiveCompanies);
router.put(
  '/admin/reset-password/:userId',
  protect,
  tenantMiddleware,
  authorize('company_admin', 'hr', 'admin'),
  adminResetPassword
);

module.exports = router;
