require('dotenv').config();

// Global error handlers to prevent crashes
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err.message);
  console.error('Stack:', err.stack);
  // Don't exit - allow server to continue running
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  console.error('Stack:', err.stack);
  // Only exit for critical errors
  if (err.code === 'EADDRINUSE') {
    console.error(`\n⚠️  Port ${apiConfig.port} is already in use.`);
    console.error(`Please ensure no other process is using port ${apiConfig.port}`);
    console.error(`Or set a different PORT environment variable.\n`);
    process.exit(1);
  }
});

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const connectDB = require('./config/database');
const errorHandler = require('./middlewares/errorHandler');
const apiConfig = require('./config/api.config');

// Import routes
const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const jobPostingRoutes = require('./routes/jobPostingRoutes');
const onboardingRoutes = require('./routes/onboardingRoutes');
const offboardingRoutes = require('./routes/offboardingRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const candidateRoutes = require('./routes/candidateRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const publicJobRoutes = require('./routes/publicJobRoutes');
const talentPoolRoutes = require('./routes/talentPoolRoutes');
const offerTemplateRoutes = require('./routes/offerTemplateRoutes');
const agreementTemplateRoutes = require('./routes/agreementTemplateRoutes');
const employeeDashboardRoutes = require('./routes/employeeDashboard');
const candidateDocumentRoutes = require('./routes/candidateDocumentRoutes');
const userRoutes = require('./routes/userRoutes');
const managerRoutes = require('./routes/managerRoutes');
const spcManagerRoutes = require('./routes/spcManagerRoutes');
const resumePoolRoutes = require('./routes/resumePoolRoutes');
const jobDescriptionRoutes = require('./routes/jobDescriptionRoutes');
const approvalRoutes = require('./routes/approvalRoutes');
const publicDocumentUploadRoutes = require('./routes/publicDocumentUploadRoutes');
const documentVerificationRoutes = require('./routes/documentVerificationRoutes');
const hrActivityHistoryRoutes = require('./routes/hrActivityHistoryRoutes');
const contractRoutes = require('./routes/contractRoutes');
const spcProjectRoutes = require('./routes/spcProjectRoutesSimple');
const leaveTypesRoutes = require('./api/leave/leaveTypes.routes');
const leaveAllocationsRoutes = require('./api/leave/leaveAllocations.routes');
const leaveRequestsRoutes = require('./api/leave/leaveRequests.routes');
const holidaysRoutes = require('./api/leave/holidays.routes');
const timesheetsRoutes = require('./api/timesheet/timesheets.routes');
const timesheetEntriesRoutes = require('./api/timesheet/timesheetEntries.routes');
const bulkUploadRoutes = require('./api/timesheet/bulkUpload.routes');
const sliceApprovalRoutes = require('./api/timesheet/sliceApproval.routes');

// Connect to database
connectDB();

// Start cron jobs for alerts
const { startCronJobs } = require('./utils/cronJobs');
startCronJobs();

const app = express();

app.set('etag', false);

// Middleware - Use centralized CORS configuration
app.use(cors(apiConfig.corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'HRMS API is running',
    timestamp: new Date().toISOString()
  });
});

// Static file serving for uploads
const uploadsPath = path.join(__dirname, '../uploads');
const resumesPath = path.join(uploadsPath, 'resumes');
console.log('📁 Uploads directory path:', uploadsPath);
console.log('📁 Resumes directory path:', resumesPath);

// Serve resume files with proper headers and CORS
app.use('/uploads/resumes', (req, res, next) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
}, express.static(resumesPath, {
  setHeaders: (res, filePath) => {
    // Set appropriate content type
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline'); // Display in browser instead of download
    }
    // Cache control
    res.setHeader('Cache-Control', 'public, max-age=3600');
  },
  dotfiles: 'allow',
  index: false
}));

// Serve other uploads
app.use('/uploads', express.static(uploadsPath, {
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
    }
  },
  dotfiles: 'allow',
  index: false
}));

// Public API Routes (no authentication required)
app.use('/api/public/jobs', publicJobRoutes);
app.use('/api/public/document-upload', publicDocumentUploadRoutes);
app.use('/api/candidate-documents', candidateDocumentRoutes);

// Protected API Routes (tenant isolation handled within route files)
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/jobs', jobPostingRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/offboarding', offboardingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/job-descriptions', jobDescriptionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/talent-pool', talentPoolRoutes);
app.use('/api/offer-templates', offerTemplateRoutes);
app.use('/api/agreement-templates', agreementTemplateRoutes);
app.use('/api/employee', employeeDashboardRoutes);
app.use('/api/user', userRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/spc-manager', spcManagerRoutes);
app.use('/api/resume-pool', resumePoolRoutes);
app.use('/api/document-verification', documentVerificationRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/hr-activity-history', hrActivityHistoryRoutes);
app.use('/api/spc', spcProjectRoutes);
app.use('/api/leave/types', leaveTypesRoutes);
app.use('/api/leave/allocations', leaveAllocationsRoutes);
app.use('/api/leave/requests', leaveRequestsRoutes);
app.use('/api/leave/holidays', holidaysRoutes);
app.use('/api/timesheet', timesheetsRoutes);
app.use('/api/timesheet/entries', timesheetEntriesRoutes);
app.use('/api/timesheet/upload', bulkUploadRoutes);
app.use('/api/timesheet/slices', sliceApprovalRoutes);
console.log('🔧 SPC Routes mounted at /api/spc');

// Error handler (must be last)
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

app.listen(apiConfig.port, '0.0.0.0', () => {
  console.log(`🚀 Server running in ${apiConfig.env} mode on port ${apiConfig.port}`);
  console.log(`📡 API Base URL: ${apiConfig.backendUrl}`);
  console.log(`🌐 Allowed Origins: ${apiConfig.allowedOrigins.join(', ')}`);
});

module.exports = app;
