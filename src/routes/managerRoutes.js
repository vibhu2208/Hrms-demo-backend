const express = require('express');
const router = express.Router();
const {
  getTeamMembers,
  getTeamStats,
  getPendingLeaves,
  approveLeave,
  rejectLeave,
  getManagerProjects,
  getManagerProjectDetails,
  assignProject,
  getManagerClients,
  updateProjectProgress,
  createTeamMeeting,
  getTeamMeetings
} = require('../controllers/managerController');
const { protect } = require('../middlewares/auth');
const { tenantMiddleware } = require('../middlewares/tenantMiddleware');

// Protect all routes - require authentication
router.use(protect);
// Apply tenant middleware for database connection
router.use(tenantMiddleware);

// Team management routes
router.get('/team-members', getTeamMembers);
router.get('/team-stats', getTeamStats);
router.get('/clients', getManagerClients);

// Project management routes
router.get('/projects', getManagerProjects);
router.get('/projects/:id', getManagerProjectDetails);
router.post('/projects', assignProject);
router.put('/projects/:id/progress', updateProjectProgress);

// Meetings
router.get('/meetings', getTeamMeetings);
router.post('/meetings', createTeamMeeting);

// Leave management routes
router.get('/pending-leaves', getPendingLeaves);
router.put('/leave/:id/approve', approveLeave);
router.put('/leave/:id/reject', rejectLeave);

module.exports = router;
