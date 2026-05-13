const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
  uploadResumeText,
  uploadBatchResumes,
  uploadResumeFile,
  getResumePool,
  getResumeById,
  updateResume,
  deleteResume,
  getProcessingStats,
  searchResumes
} = require('../controllers/resumePoolController');
const { protect, authorize } = require('../middlewares/auth');
const { tenantMiddleware } = require('../middlewares/tenantMiddleware');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/resumes/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Accept PDF and DOCX files
  if (file.mimetype === 'application/pdf' || 
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF and DOCX files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Protect all routes
router.use(protect);
router.use(tenantMiddleware);

/**
 * @route   POST /api/resume-pool/text
 * @desc    Upload raw resume text
 * @access  Private (HR, Admin)
 */
router.post('/text', 
  authorize('admin', 'hr', 'company_admin'),
  uploadResumeText
);

/**
 * @route   POST /api/resume-pool/batch
 * @desc    Upload multiple resume texts
 * @access  Private (HR, Admin, Company Admin)
 */
router.post('/batch', 
  authorize('admin', 'hr', 'company_admin'),
  uploadBatchResumes
);

/**
 * @route   POST /api/resume-pool/file
 * @desc    Upload resume file (PDF/DOCX)
 * @access  Private (HR, Admin, Company Admin)
 */
router.post('/file', 
  authorize('admin', 'hr', 'company_admin'),
  upload.single('resume'), 
  uploadResumeFile
);

/**
 * @route   GET /api/resume-pool
 * @desc    Get all resumes in pool
 * @access  Private (HR, Admin, Company Admin)
 */
router.get('/', 
  authorize('admin', 'hr', 'company_admin'),
  getResumePool
);

/**
 * @route   GET /api/resume-pool/search
 * @desc    Search resumes in pool
 * @access  Private (HR, Admin, Company Admin)
 */
router.post('/search', 
  authorize('admin', 'hr', 'company_admin'),
  searchResumes
);

/**
 * @route   GET /api/resume-pool/stats
 * @desc    Get processing statistics
 * @access  Private (HR, Admin, Company Admin)
 */
router.get('/stats', 
  authorize('admin', 'hr', 'company_admin'),
  getProcessingStats
);

/**
 * @route   GET /api/resume-pool/:id
 * @desc    Get single resume by ID
 * @access  Private (HR, Admin, Company Admin)
 */
router.get('/:id', 
  authorize('admin', 'hr', 'company_admin'),
  getResumeById
);

/**
 * @route   PUT /api/resume-pool/:id
 * @desc    Update resume
 * @access  Private (HR, Admin, Company Admin)
 */
router.put('/:id', 
  authorize('admin', 'hr', 'company_admin'),
  updateResume
);

/**
 * @route   DELETE /api/resume-pool/:id
 * @desc    Delete resume
 * @access  Private (Admin, Company Admin)
 */
router.delete('/:id', 
  authorize('admin', 'company_admin'),
  deleteResume
);

module.exports = router;
