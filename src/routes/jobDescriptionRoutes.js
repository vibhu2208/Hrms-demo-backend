const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Import controllers and middlewares
const jobDescriptionController = require('../controllers/jobDescriptionController');
const { protect } = require('../middlewares/auth');
const { tenantMiddleware } = require('../middlewares/tenantMiddleware');
const { checkAnyPermission } = require('../middlewares/permissionMiddleware');

// Configure multer for file uploads
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'jd-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF and DOC/DOCX files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Apply common middlewares to all routes
router.use(protect);
router.use(tenantMiddleware);

// JD Management Routes
router.post('/upload',
  checkAnyPermission(['create_job_posting', 'manage_candidates']),
  upload.single('jdFile'),
  jobDescriptionController.uploadAndParseJD
);

router.get('/',
  checkAnyPermission(['view_job_posting', 'view_candidates']),
  jobDescriptionController.getJDs
);

router.get('/:id',
  checkAnyPermission(['view_job_posting', 'view_candidates']),
  jobDescriptionController.getJDById
);

router.get('/:id/parsing-status',
  checkAnyPermission(['view_job_posting', 'view_candidates']),
  jobDescriptionController.checkParsingStatus
);

router.put('/:id',
  checkAnyPermission(['update_job_posting', 'manage_candidates']),
  jobDescriptionController.updateJD
);

router.delete('/:id',
  checkAnyPermission(['delete_job_posting', 'manage_candidates']),
  jobDescriptionController.deleteJD
);

// Candidate Matching Routes
router.post('/:id/match',
  checkAnyPermission(['manage_candidates', 'view_candidates']),
  jobDescriptionController.matchCandidates
);

router.get('/:id/match/stats',
  checkAnyPermission(['view_candidates']),
  jobDescriptionController.getMatchingStatistics
);

router.post('/:id/candidates/:candidateId/shortlist',
  checkAnyPermission(['manage_candidates']),
  jobDescriptionController.shortlistCandidate
);

// Utility Routes
router.post('/:id/reparse',
  checkAnyPermission(['manage_candidates', 'update_job_posting']),
  jobDescriptionController.reparseJD
);

router.get('/health/status',
  checkAnyPermission(['manage_candidates', 'view_system_health']),
  jobDescriptionController.getJDHealth
);

module.exports = router;