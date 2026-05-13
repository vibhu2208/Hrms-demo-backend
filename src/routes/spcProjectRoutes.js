const express = require('express');
const router = express.Router();
const SPCProjectController = require('../controllers/spcProjectController');
const { authenticateToken } = require('../middleware/auth');

/**
 * SPC Project Management Routes
 * All routes require authentication and implement project-based access control
 */

// Apply authentication middleware to all routes
router.use(authenticateToken);

/**
 * GET /api/spc/projects
 * Get all projects for the current user
 * Admin sees all projects, others see only assigned projects
 */
router.get('/projects', SPCProjectController.getProjects);

/**
 * POST /api/spc/projects
 * Create a new project (Admin only)
 */
router.post('/projects', SPCProjectController.createProject);

/**
 * GET /api/spc/projects/:projectId
 * Get project details with team information
 * Users can only access projects they're assigned to
 */
router.get('/projects/:projectId', SPCProjectController.getProjectDetails);

/**
 * PUT /api/spc/projects/:projectId
 * Update project (Admin and assigned managers only)
 */
router.put('/projects/:projectId', SPCProjectController.updateProject);

/**
 * POST /api/spc/projects/:projectId/assign
 * Assign users to project (Admin only)
 * Body: { managers: [ids], hrs: [ids], employees: [ids] }
 */
router.post('/projects/:projectId/assign', SPCProjectController.assignUsersToProject);

/**
 * POST /api/spc/projects/:projectId/team
 * Create team assignments (Manager-HR relationships)
 * Body: { teamAssignments: [{managerId, hrId, relationshipType, notes}] }
 */
router.post('/projects/:projectId/team', SPCProjectController.createTeamAssignments);

/**
 * GET /api/spc/dashboard
 * Get user's dashboard data based on their project assignments
 */
router.get('/dashboard', SPCProjectController.getUserDashboard);

module.exports = router;
