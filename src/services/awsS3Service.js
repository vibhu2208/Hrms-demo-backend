/**
 * AWS S3 Storage Service
 * Handles resume uploads to AWS S3
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const sanitizeForPath = (value, fallback = 'candidate') => {
  if (!value) return fallback;

  const sanitized = value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || fallback;
};

class AWSS3Service {
  constructor() {
    // Configure AWS
    AWS.config.update({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'ap-south-1'
    });

    this.s3 = new AWS.S3();
    this.bucketName = process.env.AWS_S3_BUCKET || 'spc-resumes';

    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      console.log('✅ AWS S3 client initialized');
    } else {
      console.warn('⚠️  AWS credentials not found. Resume upload to S3 will not work.');
    }
  }

  /**
   * Sanitize string for use in S3 path/folder names
   * @param {String} value - Value to sanitize
   * @param {String} fallback - Fallback value if input is empty
   * @returns {String} Sanitized string
   */
  sanitizeForPath = (value, fallback = 'candidate') => {
    if (!value) return fallback;

    const sanitized = value
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return sanitized || fallback;
  };

  /**
   * Upload resume file to S3
   * @param {String} filePath - Local file path
   * @param {String} fileName - Original file name
   * @param {String} mimeType - File MIME type
   * @param {String} candidateId - Optional candidate ID for organization
   * @returns {Promise<Object>} Upload result with URL
   */
  async uploadResume(filePath, fileName, mimeType, candidateId = null) {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured. Check environment variables.');
    }

    try {
      // Read file
      const fileBuffer = await promisify(fs.readFile)(filePath);

      // Create unique file key
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const fileExtension = path.extname(fileName).toLowerCase();

      // Organize by date for better management
      const dateFolder = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const candidateFolder = candidateId ? `candidates/${candidateId}` : 'resumes';

      const s3Key = `${candidateFolder}/${dateFolder}/${timestamp}-${randomSuffix}${fileExtension}`;

      // Upload parameters
      const uploadParams = {
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: mimeType,
        ACL: 'private', // Keep private, access via signed URLs
        Metadata: {
          originalName: fileName,
          uploadedAt: new Date().toISOString(),
          mimeType: mimeType,
          fileSize: fileBuffer.length.toString()
        }
      };

      // Upload to S3
      const uploadResult = await this.s3.upload(uploadParams).promise();

      console.log(`✅ Resume uploaded to S3: ${uploadResult.Key}`);

      return {
        success: true,
        url: uploadResult.Location,
        key: uploadResult.Key,
        bucket: uploadResult.Bucket,
        fileName: fileName,
        mimeType: mimeType,
        size: fileBuffer.length,
        uploadedAt: new Date()
      };

    } catch (error) {
      console.error('❌ AWS S3 upload error:', error);
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  /**
   * Generic file upload to S3 (supports any file type)
   * @param {Object} file - Multer file object
   * @param {String} folder - S3 folder path (e.g., 'jd-documents', 'resumes')
   * @returns {Promise<Object>} Upload result with URL
   */
  async uploadFile(file, folder = 'documents') {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured. Check environment variables.');
    }

    try {
      // Read file from path or buffer
      const fileBuffer = file.buffer || await promisify(fs.readFile)(file.path);

      // Create unique file key
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const fileExtension = path.extname(file.originalname).toLowerCase();

      // Organize by date for better management
      const dateFolder = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const s3Key = `${folder}/${dateFolder}/${timestamp}-${randomSuffix}${fileExtension}`;

      // Upload parameters
      const uploadParams = {
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: file.mimetype,
        Metadata: {
          originalName: file.originalname,
          uploadedAt: new Date().toISOString(),
          mimeType: file.mimetype,
          fileSize: fileBuffer.length.toString()
        }
      };

      // Upload to S3
      const uploadResult = await this.s3.upload(uploadParams).promise();

      console.log(`✅ File uploaded to S3: ${uploadResult.Key}`);

      return {
        success: true,
        url: uploadResult.Location,
        key: uploadResult.Key,
        bucket: uploadResult.Bucket,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: fileBuffer.length,
        uploadedAt: new Date()
      };

    } catch (error) {
      console.error('❌ AWS S3 upload error:', error);
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  /**
   * Generate signed URL for accessing private S3 file
   * @param {String} s3Key - S3 object key
   * @param {Number} expiresIn - URL expiration time in seconds (default: 1 hour)
   * @returns {String} Signed URL
   */
  generateSignedUrl(s3Key, expiresIn = 3600) {
    try {
      const signedUrl = this.s3.getSignedUrl('getObject', {
        Bucket: this.bucketName,
        Key: s3Key,
        Expires: expiresIn
      });

      return signedUrl;
    } catch (error) {
      console.error('❌ Error generating signed URL:', error);
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  /**
   * Delete file from S3
   * @param {String} s3Key - S3 object key to delete
   * @returns {Promise<Object>} Delete result
   */
  async deleteFile(s3Key) {
    try {
      const deleteParams = {
        Bucket: this.bucketName,
        Key: s3Key
      };

      const deleteResult = await this.s3.deleteObject(deleteParams).promise();
      console.log(`✅ File deleted from S3: ${s3Key}`);

      return {
        success: true,
        deletedKey: s3Key
      };

    } catch (error) {
      console.error('❌ AWS S3 delete error:', error);
      throw new Error(`S3 delete failed: ${error.message}`);
    }
  }

  /**
   * Get file metadata from S3
   * @param {String} s3Key - S3 object key
   * @returns {Promise<Object>} File metadata
   */
  async getFileMetadata(s3Key) {
    try {
      const headParams = {
        Bucket: this.bucketName,
        Key: s3Key
      };

      const metadata = await this.s3.headObject(headParams).promise();

      return {
        key: s3Key,
        size: metadata.ContentLength,
        lastModified: metadata.LastModified,
        contentType: metadata.ContentType,
        metadata: metadata.Metadata || {}
      };

    } catch (error) {
      console.error('❌ AWS S3 metadata error:', error);
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }

  /**
   * List files in a folder
   * @param {String} prefix - Folder prefix (e.g., 'candidates/', 'resumes/')
   * @returns {Promise<Array>} List of files
   */
  async listFiles(prefix = '') {
    try {
      const listParams = {
        Bucket: this.bucketName,
        Prefix: prefix
      };

      const data = await this.s3.listObjectsV2(listParams).promise();

      return (data.Contents || []).map(item => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
        signedUrl: this.generateSignedUrl(item.Key)
      }));

    } catch (error) {
      console.error('❌ AWS S3 list error:', error);
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }
}

module.exports = new AWSS3Service();