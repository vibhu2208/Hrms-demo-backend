const express = require('express');
const router = express.Router();
const SPCProjectController = require('../controllers/spcProjectControllerFixed');
const { protect } = require('../middlewares/auth');
const { SPC_ROLES, PROJECT_PERMISSIONS } = require('../config/spcProjectPermissions');
const SPCProjectAccessMiddleware = require('../middlewares/spcProjectAccess');

console.log('📦 SPC Project Routes Simple module loaded!!!');

/**
 * SPC Project Management Routes - Simplified Version
 * Basic functionality without complex middleware
 */

// Apply authentication to all routes
router.use((req, res, next) => {
  console.log('🔍 SPC Route Middleware - Request received:', {
    method: req.method,
    path: req.path,
    headers: req.headers.authorization ? 'Bearer token present' : 'No token'
  });
  protect(req, res, next);
});

/**
 * GET /api/spc/projects
 * Get all projects for the current user
 */
router.get('/projects', SPCProjectController.getProjects);

/**
 * POST /api/spc/projects
 * Create a new project (Admin only)
 */
router.post('/projects', 
  SPCProjectAccessMiddleware.requirePermission(PROJECT_PERMISSIONS.PROJECT_CREATE),
  SPCProjectController.createProject
);

/**
 * GET /api/spc/projects/:projectId
 * Get project details
 */
router.get('/projects/:projectId', 
  SPCProjectAccessMiddleware.requireProjectAccess(),
  SPCProjectController.getProjectDetails
);

/**
 * PUT /api/spc/projects/:projectId
 * Update project
 */
router.put('/projects/:projectId', 
  SPCProjectAccessMiddleware.requireProjectAccess(),
  SPCProjectAccessMiddleware.requirePermission(PROJECT_PERMISSIONS.PROJECT_EDIT),
  SPCProjectController.updateProject
);

/**
 * POST /api/spc/projects/:projectId/assign
 * Assign users to project (Admin only)
 */
router.post('/projects/:projectId/assign', 
  SPCProjectAccessMiddleware.requirePermission(PROJECT_PERMISSIONS.TEAM_ASSIGN_MANAGER),
  SPCProjectController.assignUsersToProject
);

/**
 * POST /api/spc/projects/:projectId/team
 * Create team assignments
 */
router.post('/projects/:projectId/team', SPCProjectController.createTeamAssignments);

/**
 * GET /api/spc/dashboard
 * Get user's dashboard data
 */
router.get('/dashboard', 
  // SPCProjectAccessMiddleware.requirePermission(PROJECT_PERMISSIONS.PROJECT_VIEW_ASSIGNED),
  (req, res, next) => {
    console.log('🎯 SPC ROUTE MIDDLEWARE: Dashboard route reached!!!');
    console.log('🔍 User in dashboard route:', req.user);
    next();
  }, 
  SPCProjectController.getUserDashboard
);

module.exports = router;
