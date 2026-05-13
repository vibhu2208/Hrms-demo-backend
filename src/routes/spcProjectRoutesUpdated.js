const express = require('express');
const router = express.Router();
const SPCProjectController = require('../controllers/spcProjectController');
const { authenticateToken } = require('../middlewares/auth');
const SPCProjectAccessMiddleware = require('../middlewares/spcProjectAccess');
const { PROJECT_PERMISSIONS } = require('../config/spcProjectPermissions');

/**
 * SPC Project Management Routes with Access Control
 * All routes implement project-based access control
 */

// Apply authentication and project context middleware to all routes
router.use(authenticateToken);
router.use(SPCProjectAccessMiddleware.addProjectContext());

/**
 * GET /api/spc/projects
 * Get all projects for the current user
 * Admin sees all projects, others see only assigned projects
 */
router.get('/projects', 
  SPCProjectAccessMiddleware.filterByProjectAccess(),
  SPCProjectController.getProjects
);

/**
 * POST /api/spc/projects
 * Create a new project (Admin only)
 */
router.post('/projects', 
  SPCProjectAccessMiddleware.requirePermission(PROJECT_PERMISSIONS.PROJECT_CREATE),
  SPCProjectAccessMiddleware.validateProjectAssignments(),
  SPCProjectController.createProject
);

/**
 * GET /api/spc/projects/:projectId
 * Get project details with team information
 * Users can only access projects they're assigned to
 */
router.get('/projects/:projectId', 
  SPCProjectAccessMiddleware.requireProjectAccess(),
  SPCProjectController.getProjectDetails
);

/**
 * PUT /api/spc/projects/:projectId
 * Update project (Admin and assigned managers only)
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
  SPCProjectAccessMiddleware.requireProjectAccess(),
  SPCProjectAccessMiddleware.requirePermission(PROJECT_PERMISSIONS.USER_ASSIGN_PROJECT),
  SPCProjectAccessMiddleware.validateProjectAssignments(),
  SPCProjectController.assignUsersToProject
);

/**
 * POST /api/spc/projects/:projectId/team
 * Create team assignments (Manager-HR relationships)
 */
router.post('/projects/:projectId/team', 
  SPCProjectAccessMiddleware.requireProjectAccess(),
  SPCProjectAccessMiddleware.requireTeamManagementAccess(),
  SPCProjectController.createTeamAssignments
);

/**
 * GET /api/spc/dashboard
 * Get user's dashboard data based on their project assignments
 */
router.get('/dashboard', 
  SPCProjectAccessMiddleware.filterByProjectAccess(),
  SPCProjectController.getUserDashboard
);

module.exports = router;
