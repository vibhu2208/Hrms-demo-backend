/**
 * Mount API routes with startup logging (helps diagnose slow/hung requires).
 */
function mountRoutes(app) {
  const routes = [
    ['public jobs', '/api/public/jobs', './publicJobRoutes'],
    ['public document upload', '/api/public/document-upload', './publicDocumentUploadRoutes'],
    ['candidate documents', '/api/candidate-documents', './candidateDocumentRoutes'],
    ['auth', '/api/auth', './authRoutes'],
    ['employees', '/api/employees', './employeeRoutes'],
    ['departments', '/api/departments', './departmentRoutes'],
    ['approvals', '/api/approvals', './approvalRoutes'],
    ['jobs', '/api/jobs', './jobPostingRoutes'],
    ['onboarding', '/api/onboarding', './onboardingRoutes'],
    ['offboarding', '/api/offboarding', './offboardingRoutes'],
    ['dashboard', '/api/dashboard', './dashboardRoutes'],
    ['candidates', '/api/candidates', './candidateRoutes'],
    ['job descriptions', '/api/job-descriptions', './jobDescriptionRoutes'],
    ['notifications', '/api/notifications', './notificationRoutes'],
    ['talent pool', '/api/talent-pool', './talentPoolRoutes'],
    ['offer templates', '/api/offer-templates', './offerTemplateRoutes'],
    ['agreement templates', '/api/agreement-templates', './agreementTemplateRoutes'],
    ['employee dashboard', '/api/employee', './employeeDashboard'],
    ['user', '/api/user', './userRoutes'],
    ['manager', '/api/manager', './managerRoutes'],
    ['spc manager', '/api/spc-manager', './spcManagerRoutes'],
    ['resume pool', '/api/resume-pool', './resumePoolRoutes'],
    ['document verification', '/api/document-verification', './documentVerificationRoutes'],
    ['contracts', '/api/contracts', './contractRoutes'],
    ['hr activity', '/api/hr-activity-history', './hrActivityHistoryRoutes'],
    ['spc projects', '/api/spc', './spcProjectRoutesSimple'],
    ['leave types', '/api/leave/types', '../api/leave/leaveTypes.routes'],
    ['leave allocations', '/api/leave/allocations', '../api/leave/leaveAllocations.routes'],
    ['leave requests', '/api/leave/requests', '../api/leave/leaveRequests.routes'],
    ['leave holidays', '/api/leave/holidays', '../api/leave/holidays.routes'],
    ['timesheets', '/api/timesheet', '../api/timesheet/timesheets.routes'],
    ['timesheet entries', '/api/timesheet/entries', '../api/timesheet/timesheetEntries.routes'],
    ['timesheet upload', '/api/timesheet/upload', '../api/timesheet/bulkUpload.routes'],
    ['timesheet slices', '/api/timesheet/slices', '../api/timesheet/sliceApproval.routes'],
  ];

  for (const [label, mountPath, modulePath] of routes) {
    const started = Date.now();
    process.stdout.write(`  → ${label}... `);
    app.use(mountPath, require(modulePath));
    console.log(`ok (${Date.now() - started}ms)`);
  }

  console.log('🔧 SPC Routes mounted at /api/spc');
}

module.exports = mountRoutes;
