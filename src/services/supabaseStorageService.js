/**
 * Supabase Storage Service
 * Handles document uploads to Supabase storage
 */

const { createClient } = require('@supabase/supabase-js');

class SupabaseStorageService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_ANON_KEY;
    this.bucketName = process.env.SUPABASE_BUCKET_NAME || 'candidate-documents';
    
    if (this.supabaseUrl && this.supabaseKey) {
      this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
      console.log('✅ Supabase client initialized');
    } else {
      console.warn('⚠️  Supabase credentials not found. Document upload will not work.');
    }
  }

  /**
   * Upload candidate document
   * @param {String} candidateId - Candidate ID
   * @param {String} documentType - Type of document (aadhar, pan, passport, etc.)
   * @param {Buffer} fileBuffer - File buffer
   * @param {String} fileName - Original file name
   * @param {String} mimeType - File MIME type
   */
  async uploadCandidateDocument(candidateId, documentType, fileBuffer, fileName, mimeType) {
    if (!this.supabase) {
      throw new Error('Supabase client not initialized. Check environment variables.');
    }

    try {
      // Create file path: candidate-documents/{candidateId}/{documentType}/{fileName}
      const filePath = `${candidateId}/${documentType}/${Date.now()}-${fileName}`;

      // Upload to Supabase
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(filePath, fileBuffer, {
          contentType: mimeType,
          upsert: true
        });

      if (error) {
        throw new Error(`Supabase upload error: ${error.message}`);
      }

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(filePath);

      return {
        success: true,
        filePath,
        publicUrl: urlData.publicUrl,
        fileName,
        documentType,
        uploadedAt: new Date()
      };
    } catch (error) {
      console.error('Error uploading to Supabase:', error);
      throw error;
    }
  }

  /**
   * Get candidate document URL
   */
  async getDocumentUrl(filePath) {
    if (!this.supabase) {
      throw new Error('Supabase client not initialized');
    }

    const { data } = this.supabase.storage
      .from(this.bucketName)
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  /**
   * Delete candidate document
   */
  async deleteDocument(filePath) {
    if (!this.supabase) {
      throw new Error('Supabase client not initialized');
    }

    const { error } = await this.supabase.storage
      .from(this.bucketName)
      .remove([filePath]);

    if (error) {
      throw new Error(`Failed to delete document: ${error.message}`);
    }

    return { success: true };
  }

  /**
   * List all documents for a candidate
   */
  async listCandidateDocuments(candidateId) {
    if (!this.supabase) {
      throw new Error('Supabase client not initialized');
    }

    const { data, error } = await this.supabase.storage
      .from(this.bucketName)
      .list(candidateId, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) {
      throw new Error(`Failed to list documents: ${error.message}`);
    }

    return data;
  }

  /**
   * Upload multiple documents
   */
  async uploadMultipleDocuments(candidateId, documents) {
    const results = [];
    const errors = [];

    for (const doc of documents) {
      try {
        const result = await this.uploadCandidateDocument(
          candidateId,
          doc.documentType,
          doc.fileBuffer,
          doc.fileName,
          doc.mimeType
        );
        results.push(result);
      } catch (error) {
        errors.push({
          documentType: doc.documentType,
          fileName: doc.fileName,
          error: error.message
        });
      }
    }

    return {
      success: errors.length === 0,
      uploaded: results.length,
      failed: errors.length,
      results,
      errors
    };
  }

  /**
   * Check if bucket exists, create if not
   */
  async ensureBucketExists() {
    if (!this.supabase) {
      throw new Error('Supabase client not initialized');
    }

    try {
      const { data: buckets } = await this.supabase.storage.listBuckets();
      const bucketExists = buckets.some(b => b.name === this.bucketName);

      if (!bucketExists) {
        const { error } = await this.supabase.storage.createBucket(this.bucketName, {
          public: true
        });

        if (error) {
          throw new Error(`Failed to create bucket: ${error.message}`);
        }

        console.log(`✅ Created Supabase bucket: ${this.bucketName}`);
      }

      return true;
    } catch (error) {
      console.error('Error ensuring bucket exists:', error);
      return false;
    }
  }
}

module.exports = new SupabaseStorageService();
