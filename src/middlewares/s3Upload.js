const multer = require('multer');
const awsS3Service = require('../services/awsS3Service');
const fs = require('fs');
const path = require('path');

// Configure multer for memory storage (for S3 upload)
const storage = multer.memoryStorage();

// File filter for resumes (PDF, DOC, DOCX)
const resumeFileFilter = (req, file, cb) => {
  if (file.fieldname === 'resume') {
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword' // .doc
    ];

    const allowedExts = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, and DOCX files are allowed for resume uploads'), false);
    }
  } else {
    cb(null, true);
  }
};

// Configure multer for S3 upload
const upload = multer({
  storage: storage,
  fileFilter: resumeFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 // Only one file at a time
  }
});

// Middleware for S3 resume upload
const uploadResumeToS3 = async (req, res, next) => {
  console.log('🚀 S3 Upload middleware called');
  console.log('Content-Type:', req.headers['content-type']);
  
  upload.single('resume')(req, res, async (err) => {
    if (err) {
      console.error('❌ Upload middleware error:', err);
      return next(err);
    }
    
    console.log('📁 File received:', !!req.file);
    console.log('📝 Body keys:', Object.keys(req.body));
    
    // If no file uploaded, continue without S3 upload
    if (!req.file) {
      console.log('⚠️ No resume file uploaded');
      return next();
    }
    
    try {
      // Check if S3 credentials are configured
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        console.warn('⚠️ AWS S3 credentials not configured. Falling back to local storage.');
        return next();
      }
      
      console.log('📤 Uploading resume to S3...');
      
      // Upload to S3
      const s3Result = await awsS3Service.uploadFile(req.file, 'resumes');
      
      if (s3Result.success) {
        console.log('✅ Resume uploaded to S3 successfully');
        
        // Replace file information with S3 information
        req.file.s3Key = s3Result.key;
        req.file.s3Url = s3Result.url;
        req.file.s3Bucket = s3Result.bucket;
        req.file.location = s3Result.url; // For compatibility
        
        // Clean up local file if it exists (multer memory storage shouldn't create files)
        if (req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } else {
        throw new Error('S3 upload failed');
      }
      
    } catch (s3Error) {
      console.error('❌ S3 upload error:', s3Error);
      // Continue with local storage as fallback
      console.log('🔄 Falling back to local storage due to S3 error');
    }
    
    next();
  });
};

// Error handling middleware
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size allowed is 10MB.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Only one file is allowed.'
      });
    }
    return res.status(400).json({
      success: false,
      message: 'File upload error: ' + error.message
    });
  }
  
  if (error.message.includes('Only PDF files are allowed')) {
    return res.status(400).json({
      success: false,
      message: 'Only PDF, DOC, and DOCX files are allowed for resume uploads.'
    });
  }
  
  next(error);
};

// Helper function to get S3 file URL (signed URL for private files)
const getS3FileUrl = (file, expiresIn = 3600) => {
  if (!file) return null;
  
  // If file has S3 information, generate signed URL
  if (file.s3Key) {
    try {
      return awsS3Service.generateSignedUrl(file.s3Key, expiresIn);
    } catch (error) {
      console.error('❌ Error generating S3 signed URL:', error);
      return file.s3Url; // Fallback to direct URL if signed URL fails
    }
  }
  
  // Fallback to local file URL
  const { getFileUrl } = require('./fileUpload');
  return getFileUrl(file.filename, 'resume');
};

module.exports = {
  uploadResumeToS3,
  handleUploadError,
  getS3FileUrl,
  upload
};
