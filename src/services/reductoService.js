const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Reducto Resume Parsing Service
 * Integrates with Reducto API to extract structured candidate data from resumes
 */
class ReductoService {
  constructor() {
    this.apiKey = process.env.REDUCTO_API_KEY;
    this.baseUrl = process.env.REDUCTO_BASE_URL ? `${process.env.REDUCTO_BASE_URL}/extract` : 'https://api.reducto.ai/extract';
    this.maxRetries = parseInt(process.env.REDUCTO_MAX_RETRIES) || 3;
    this.timeout = parseInt(process.env.REDUCTO_TIMEOUT) || 120000; // 2 minutes
    this.retryDelay = parseInt(process.env.REDUCTO_RETRY_DELAY) || 2000; // 2 seconds
    this.maxFileSize = parseInt(process.env.REDUCTO_MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB
    this.supportedFormats = ['.pdf', '.docx', '.doc'];

    // Performance optimization settings
    this.enableCache = process.env.REDUCTO_ENABLE_CACHE !== 'false'; // Default true
    this.cacheTtl = parseInt(process.env.REDUCTO_CACHE_TTL) || 3600000; // 1 hour
    this.maxConcurrentRequests = parseInt(process.env.REDUCTO_MAX_CONCURRENT) || 5; // Max concurrent requests
    this.enableBatchProcessing = process.env.REDUCTO_ENABLE_BATCH !== 'false'; // Default true
    this.batchSize = parseInt(process.env.REDUCTO_BATCH_SIZE) || 10; // Max files per batch

    // Initialize caches and metrics
    this.cache = new Map(); // Simple in-memory cache
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageProcessingTime: 0,
      lastReset: Date.now()
    };

    // Request queue for rate limiting
    this.requestQueue = [];
    this.activeRequests = 0;

    // Initialize axios instance with optimized config
    this.axiosInstance = axios.create({
      timeout: this.timeout,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      headers: {
        'User-Agent': 'HRMS-Reduction-Parser/2.0',
        'Accept': 'application/json'
      }
    });

    // Start cache cleanup interval
    if (this.enableCache) {
      setInterval(() => this.cleanupCache(), 300000); // Clean every 5 minutes
    }

    // Start metrics reset interval (daily)
    setInterval(() => this.resetMetrics(), 86400000); // Reset daily
  }

  /**
   * Enhanced system prompt for Reducto API - optimized for HRMS candidate tracking
   */
  getSystemPrompt() {
    return `You are an expert AI resume parser for an HRMS candidate tracking system. Your task is to extract accurate, structured candidate data from resumes with high precision.

CRITICAL EXTRACTION RULES:
1. Extract ONLY fields defined in the schema - no additional fields allowed
2. NEVER guess, infer, or hallucinate values - only extract explicitly stated information
3. REQUIRED FIELDS must always be present (even if null): firstName, lastName, email, phone, currentLocation, skills
4. MOST FIELDS in resumes are OPTIONAL - only extract when clearly and explicitly present
5. Return valid JSON only - no explanations, comments, or extra text

DATA EXTRACTION REALITY:
- **RELIABLE (almost always in resumes)**: firstName, lastName, email, phone, currentLocation, skills
- **SOMETIMES PRESENT**: currentCompany, currentDesignation, experienceYears (if explicitly stated)
- **RARELY PRESENT**: appliedFor, preferredLocation, source, alternatePhone, currentCTC, expectedCTC, noticePeriod
- **SYSTEM FIELDS**: stage (always null), notes (AI-generated summary)

EXPERIENCE EXTRACTION RULES:
- Only extract if EXPLICITLY stated (e.g., "5 years experience", "3+ years in software development")
- Calculate from work history dates ONLY if all jobs have clear start/end dates
- If experience is not explicitly stated AND cannot be accurately calculated, leave as null
- NEVER estimate or infer experience from job titles or education alone

DATA NORMALIZATION STANDARDS:
- Names: Proper case (e.g., "John Smith", not "john smith")
- Phone: Digits only, no spaces/dashes/+91 (e.g., "9876543210")
- Email: Lowercase, valid format only
- Skills: Standardized short names (e.g., "JavaScript", "React", "Python")
- Location: Current city/state (e.g., "Pune, Maharashtra" or "Bangalore")

EXTRACTION SPECIFICS:
- **REQUIRED**: firstName, lastName, email, phone, currentLocation, skills - ALWAYS include even if null
- **CONDITIONAL**: experienceYears - only if explicitly stated OR calculable from complete work history
- **OPTIONAL**: Everything else - extract only when clearly present in resume

QUALITY ASSURANCE:
- Cross-reference information across resume sections
- Prefer explicit statements over implicit inferences
- Use most recent/relevant information when multiple options exist
- Maintain data consistency and logical relationships`;
  }

  /**
   * Realistic schema for Reducto API response - focused on reliably extractable fields
   */
  getSchema() {
    return {
      "type": "object",
      "properties": {
        "firstName": {
          "type": ["string", "null"],
          "description": "REQUIRED: Candidate's first name in proper case (e.g., 'John') - Almost always present in resumes"
        },
        "lastName": {
          "type": ["string", "null"],
          "description": "REQUIRED: Candidate's last name in proper case (e.g., 'Smith') - Almost always present in resumes"
        },
        "email": {
          "type": ["string", "null"],
          "description": "REQUIRED: Primary email address in lowercase (e.g., 'john.smith@email.com') - Standard in resumes"
        },
        "phone": {
          "type": ["string", "null"],
          "description": "REQUIRED: Primary phone number, digits only (e.g., '9876543210') - Standard in resumes"
        },
        "currentLocation": {
          "type": ["string", "null"],
          "description": "REQUIRED: Current city and state (e.g., 'Pune, Maharashtra') - Usually present in contact section"
        },
        "skills": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "REQUIRED: Array of technical skills, tools, and frameworks - Almost always present in technical resumes"
        },
        "currentCompany": {
          "type": ["string", "null"],
          "description": "OPTIONAL: Most recent/current employer name - Present in some resumes with work experience"
        },
        "currentDesignation": {
          "type": ["string", "null"],
          "description": "OPTIONAL: Most recent/current job title/designation - Present in some resumes with work experience"
        },
        "experienceYears": {
          "type": ["number", "null"],
          "description": "OPTIONAL: Total years of experience ONLY if explicitly stated (e.g., '5 years experience') - DO NOT calculate from dates"
        },
        "alternatePhone": {
          "type": ["string", "null"],
          "description": "RARE: Secondary phone number - Almost never present in resumes"
        },
        "appliedFor": {
          "type": ["string", "null"],
          "description": "RARE: Job position being applied for - Not typically in resume content"
        },
        "preferredLocation": {
          "type": ["string", "null"],
          "description": "RARE: Preferred work location - Not typically in standard resumes"
        },
        "source": {
          "type": ["string", "null"],
          "enum": ["linkedin", "naukri", "referral", "job-portal", "walk-in", "other", null],
          "description": "RARE: Resume source - System field, not resume content"
        },
        "experienceMonths": {
          "type": ["number", "null"],
          "description": "RARE: Additional months - Only if explicitly stated, never calculated"
        },
        "currentCTC": {
          "type": ["number", "null"],
          "description": "RARE: Current salary - Almost never stated in resumes"
        },
        "expectedCTC": {
          "type": ["number", "null"],
          "description": "RARE: Expected salary - Almost never stated in resumes"
        },
        "noticePeriod": {
          "type": ["string", "null"],
          "description": "RARE: Notice period - Almost never stated in resumes"
        },
        "stage": {
          "type": ["string", "null"],
          "description": "SYSTEM: Always null - HRMS system managed field",
          "enum": [null]
        },
        "notes": {
          "type": ["string", "null"],
          "description": "SYSTEM: AI-generated summary of reliable extracted information"
        }
      },
      "required": [
        "firstName", "lastName", "email", "phone", "currentLocation", "skills",
        "alternatePhone", "appliedFor", "preferredLocation", "source",
        "experienceYears", "experienceMonths", "currentCompany", "currentDesignation",
        "currentCTC", "expectedCTC", "noticePeriod", "stage", "notes"
      ],
      "additionalProperties": false
    };
  }

  /**
   * Validate request parameters before processing
   * @param {string} filePath - Path to resume file
   * @returns {Object} - Validation result
   */
  validateRequest(filePath) {
    try {
      // Check API key
      if (!this.apiKey) {
        return {
          valid: false,
          error: 'Reducto API key not configured. Please set REDUCTO_API_KEY environment variable.'
        };
      }

      // Check file exists
      if (!fs.existsSync(filePath)) {
        return {
          valid: false,
          error: `Resume file not found: ${filePath}`
        };
      }

      // Check file size
      const stats = fs.statSync(filePath);
      if (stats.size > this.maxFileSize) {
        return {
          valid: false,
          error: `File size (${stats.size} bytes) exceeds maximum allowed size (${this.maxFileSize} bytes)`
        };
      }

      // Check file extension
      const fileExt = path.extname(filePath).toLowerCase();
      if (!this.supportedFormats.includes(fileExt)) {
        return {
          valid: false,
          error: `Unsupported file format: ${fileExt}. Supported formats: ${this.supportedFormats.join(', ')}`
        };
      }

      return { valid: true };

    } catch (error) {
      return {
        valid: false,
        error: `Validation error: ${error.message}`
      };
    }
  }

  /**
   * Determine if an error should not be retried
   * @param {Error} error - The error to check
   * @returns {boolean} - True if error should not be retried
   */
  isNonRetryableError(error) {
    // Don't retry on authentication errors
    if (error.response?.status === 401 || error.response?.status === 403) {
      return true;
    }

    // Don't retry on client errors (4xx except 429)
    if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
      return true;
    }

    // Don't retry on validation errors
    if (error.message?.includes('VALIDATION_ERROR')) {
      return true;
    }

    return false;
  }

  /**
   * Attempt to parse resume with specific method
   * @param {string} filePath - Path to resume file
   * @param {number} attempt - Current attempt number
   * @returns {Promise<Object>} - Parsing result
   */
  async attemptParse(filePath, attempt) {
    const fileExt = path.extname(filePath).toLowerCase();

    // Try different methods based on attempt number
    if (attempt === 1) {
      return await this.parseWithSchema(filePath, fileExt);
    } else if (attempt === 2) {
      return await this.parseSimpleUpload(filePath, fileExt);
    } else {
      return await this.parseTwoStepMethod(filePath, fileExt);
    }
  }

  /**
   * Parse using schema and system prompt (preferred method)
   * @param {string} filePath - Path to resume file
   * @param {string} fileExt - File extension
   * @returns {Promise<Object>} - Parsing result
   */
  async parseWithSchema(filePath, fileExt) {
    console.log(`🔧 Attempting schema method for ${fileExt} file`);

    const formData = this.createFormData(filePath, fileExt);
    formData.append('system_prompt', this.getSystemPrompt());
    formData.append('schema', JSON.stringify(this.getSchema()));

    // Get headers safely
    const formHeaders = formData.getHeaders ? formData.getHeaders() : {};
    console.log('📋 Form headers:', Object.keys(formHeaders));

    try {
      const response = await this.axiosInstance.post(this.baseUrl, formData, {
        ...this.axiosConfig,
        headers: {
          ...this.axiosConfig.headers,
          ...formHeaders,
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      console.log('✅ Schema method successful');
      return this.processSuccessfulResponse(response.data, 'schema_method');
    } catch (error) {
      console.error('❌ Schema method failed:', error.message);
      console.error('❌ Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        code: error.code,
        errno: error.errno
      });
      throw error;
    }
  }

  /**
   * Parse using simple file upload
   * @param {string} filePath - Path to resume file
   * @param {string} fileExt - File extension
   * @returns {Promise<Object>} - Parsing result
   */
  async parseSimpleUpload(filePath, fileExt) {
    const formData = this.createFormData(filePath, fileExt);

    // Get headers safely
    const formHeaders = formData.getHeaders ? formData.getHeaders() : {};

    const response = await this.axiosInstance.post(this.baseUrl, formData, {
      ...this.axiosConfig,
      headers: {
        ...this.axiosConfig.headers,
        ...formHeaders,
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    return this.processSuccessfulResponse(response.data, 'simple_upload');
  }

  /**
   * Parse using two-step method (upload then extract)
   * @param {string} filePath - Path to resume file
   * @param {string} fileExt - File extension
   * @returns {Promise<Object>} - Parsing result
   */
  async parseTwoStepMethod(filePath, fileExt) {
    // Step 1: Upload file
    const uploadUrl = this.baseUrl.replace('/extract', '/upload');
    const uploadFormData = new FormData();
    uploadFormData.append('file', fs.createReadStream(filePath));

    // Get headers safely
    const uploadHeaders = uploadFormData.getHeaders ? uploadFormData.getHeaders() : {};

    const uploadResponse = await this.axiosInstance.post(uploadUrl, uploadFormData, {
      ...this.axiosConfig,
      headers: {
        ...this.axiosConfig.headers,
        ...uploadHeaders,
        'Authorization': `Bearer ${this.apiKey}`,
      },
      timeout: 60000, // Shorter timeout for upload
    });

    const fileReference = uploadResponse.data.file_id || uploadResponse.data.id || uploadResponse.data;

    if (!fileReference) {
      throw new Error('File upload failed - no file reference returned');
    }

    // Step 2: Extract data
    const extractPayload = {
      input: fileReference,
      system_prompt: this.getSystemPrompt(),
      schema: this.getSchema()
    };

    const extractResponse = await this.axiosInstance.post(this.baseUrl, extractPayload, {
      ...this.axiosConfig,
      headers: {
        ...this.axiosConfig.headers,
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    return this.processSuccessfulResponse(extractResponse.data, 'two_step_method');
  }

  /**
   * Create FormData for file upload
   * @param {string} filePath - Path to resume file
   * @param {string} fileExt - File extension
   * @returns {FormData} - Configured FormData object
   */
  createFormData(filePath, fileExt) {
    const formData = new FormData();
    const fileStream = fs.createReadStream(filePath);
    const fileName = path.basename(filePath);

    // Determine content type
    let contentType = 'application/pdf';
    if (fileExt === '.docx') {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (fileExt === '.doc') {
      contentType = 'application/msword';
    }

    formData.append('file', fileStream, {
      filename: fileName,
      contentType: contentType
    });

    return formData;
  }

  /**
   * Process successful API response
   * @param {Object} responseData - Raw API response
   * @param {string} method - Method used for parsing
   * @returns {Object} - Processed result
   */
  processSuccessfulResponse(responseData, method) {
    if (!responseData) {
      throw new Error('Invalid response from Reducto API - no data returned');
    }

    // Transform and normalize data
    const transformedData = this.transformReductoResponse(responseData);
    const normalizedData = this.normalizeData(transformedData);

    // Validate normalized data structure
    this.validateNormalizedData(normalizedData);

    return {
      success: true,
      data: normalizedData,
      rawText: transformedData.rawText || '',
      confidence: responseData.confidence || {},
      metadata: {
        parsedAt: new Date(),
        version: '2.0',
        source: 'reducto',
        endpoint: this.baseUrl,
        method: method,
        jobId: responseData.job_id || responseData.id,
        usage: responseData.usage,
        processingTime: Date.now(),
        rawResponse: responseData
      }
    };
  }

  /**
   * Parse resume using optimized Reducto API flow: Upload → Extract
   * @param {string} filePath - Path to the resume file
   * @returns {Promise<Object>} - Parsed candidate data
   */
  async parseResume(filePath) {
    this.metrics.totalRequests++;
    const startTime = Date.now();

    try {
      // Pre-flight validation
      const validation = this.validateRequest(filePath);
      if (!validation.valid) {
        this.metrics.failedRequests++;
        this.updateAverageProcessingTime(Date.now() - startTime);
        return this.createErrorResponse(validation.error, 'VALIDATION_ERROR', startTime);
      }

      console.log(`🔄 Starting Reducto parsing for file: ${path.basename(filePath)}`);
      console.log('🔑 API Key configured:', !!this.apiKey, 'URL:', this.baseUrl);

      // Check API key
      if (!this.apiKey) {
        console.error('❌ REDUCTO_API_KEY environment variable not set');
        this.metrics.failedRequests++;
        this.updateAverageProcessingTime(Date.now() - startTime);
        return this.createErrorResponse(
          'Reducto API key not configured. Please set REDUCTO_API_KEY environment variable.',
          'CONFIGURATION_ERROR',
          startTime
        );
      }

      // Step 1: Upload file to get reducto:// URL
      console.log('📤 Step 1: Uploading file to Reducto...');
      const uploadResult = await this.uploadFileToReducto(filePath);

      if (!uploadResult.success) {
        console.error('❌ File upload failed:', uploadResult.error);
        this.metrics.failedRequests++;
        this.updateAverageProcessingTime(Date.now() - startTime);
        return this.createErrorResponse(uploadResult.error, 'UPLOAD_FAILED', startTime);
      }

      const fileUrl = uploadResult.fileUrl;
      console.log('✅ File uploaded successfully:', fileUrl);

      // Step 2: Extract structured data using the file URL
      console.log('📤 Step 2: Extracting structured data...');
      const extractResult = await this.extractDataFromReducto(fileUrl);

      if (!extractResult.success) {
        console.error('❌ Data extraction failed:', extractResult.error);
        this.metrics.failedRequests++;
        this.updateAverageProcessingTime(Date.now() - startTime);
        return this.createErrorResponse(extractResult.error, 'EXTRACTION_FAILED', startTime);
      }

      console.log('✅ Reducto parsing completed successfully');
      this.metrics.successfulRequests++;
      this.updateAverageProcessingTime(Date.now() - startTime);

      return extractResult;

    } catch (error) {
      console.error('❌ Unexpected error in parseResume:', error);
      this.metrics.failedRequests++;
      this.updateAverageProcessingTime(Date.now() - startTime);
      return this.createErrorResponse(error, 'UNEXPECTED_ERROR', startTime);
    }
  }

  /**
   * Upload file to Reducto and get file URL for extraction
   * @param {string} filePath - Path to the file to upload
   * @returns {Promise<Object>} - Upload result with file URL
   */
  async uploadFileToReducto(filePath) {
    try {
      const uploadUrl = `${this.baseUrl.replace('/extract', '')}/upload`;
      console.log('📤 Base URL:', this.baseUrl);
      console.log('📤 Upload URL:', uploadUrl);

      const formData = this.createFormData(filePath, path.extname(filePath).toLowerCase());
      console.log('📋 FormData created, file exists:', fs.existsSync(filePath));

      // Get headers safely
      const formHeaders = formData.getHeaders ? formData.getHeaders() : {};
      console.log('📋 Form headers available:', Object.keys(formHeaders).length > 0);

      console.log('🔑 API Key present:', !!this.apiKey, 'length:', this.apiKey?.length || 0);

      console.log('📤 Making axios request...');
      const response = await this.axiosInstance.post(uploadUrl, formData, {
        headers: {
          ...formHeaders,
          'Authorization': `Bearer ${this.apiKey}`,
        },
        timeout: 60000, // 60 seconds for upload
      });

      console.log('📦 Upload response received, status:', response.status);
      console.log('📦 Response data:', JSON.stringify(response.data, null, 2));

      if (!response.data || !response.data.file_id) {
        throw new Error('Upload response missing file_id');
      }

      // Check if file_id already includes the reducto:// prefix
      const fileUrl = response.data.file_id.startsWith('reducto://')
        ? response.data.file_id
        : `reducto://${response.data.file_id}`;
      console.log('📋 Generated file URL:', fileUrl);

      return {
        success: true,
        fileUrl: fileUrl,
        fileId: response.data.file_id,
        presignedUrl: response.data.presigned_url
      };

    } catch (error) {
      console.error('❌ File upload error:', error.message);
      console.error('❌ Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        code: error.code,
        errno: error.errno,
        syscall: error.syscall,
        hostname: error.hostname
      });

      let errorMessage = 'Upload failed: ';
      if (error.response?.data?.detail) {
        errorMessage += error.response.data.detail;
      } else if (error.response?.data?.message) {
        errorMessage += error.response.data.message;
      } else if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage += 'Unknown error occurred';
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Extract structured data from uploaded file using Reducto extract API
   * @param {string} fileUrl - Reducto file URL (reducto://...)
   * @returns {Promise<Object>} - Extraction result
   */
  async extractDataFromReducto(fileUrl) {
    try {
      const extractUrl = `${this.baseUrl.replace('/extract', '')}/extract`;
      console.log('📤 Extracting from:', extractUrl);

      const extractPayload = {
        input: fileUrl,
        instructions: {
          schema: this.getSchema(),
          system_prompt: this.getSystemPrompt()
        },
        settings: {
          include_images: false,
          optimize_for_latency: false,
          array_extract: false,
          citations: {
            enabled: false,
            numerical_confidence: true
          }
        }
      };

      console.log('📋 Extract payload prepared with schema and prompt');

      const response = await this.axiosInstance.post(extractUrl, extractPayload, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('📦 Raw extract response received');
      console.log('📊 Response structure:', {
        hasResult: !!response.data?.result,
        resultType: Array.isArray(response.data?.result) ? 'array' : typeof response.data?.result,
        resultLength: Array.isArray(response.data?.result) ? response.data.result.length : 'N/A'
      });
      console.log('📋 Full response data:', JSON.stringify(response.data, null, 2));

      // Transform and normalize data
      const transformedData = this.transformReductoResponse(response.data);
      const normalizedData = this.normalizeData(transformedData);

      // Validate normalized data structure
      this.validateNormalizedData(normalizedData);

      return {
        success: true,
        data: normalizedData,
        rawText: transformedData.rawText || '',
        confidence: response.data.confidence || {},
        metadata: {
          parsedAt: new Date(),
          version: '2.0',
          source: 'reducto',
          endpoint: extractUrl,
          jobId: response.data.job_id || response.data.id,
          usage: response.data.usage,
          processingTime: Date.now(),
          rawResponse: response.data
        }
      };

    } catch (error) {
      console.error('❌ Data extraction error:', error.message);
      console.error('❌ Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        code: error.code,
        errno: error.errno,
        syscall: error.syscall,
        hostname: error.hostname
      });

      let errorMessage = 'Extraction failed: ';
      if (error.response?.data?.detail) {
        errorMessage += error.response.data.detail;
      } else if (error.response?.data?.message) {
        errorMessage += error.response.data.message;
      } else if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage += 'Unknown error occurred';
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Transform Reducto API response to our expected format
   * @param {Object} reductoResponse - Raw response from Reducto API
   * @returns {Object} - Transformed candidate data
   */
  transformReductoResponse(reductoResponse) {
    try {
      console.log('🔄 Transforming Reducto response...');

      // Extract the first result from the array (Reducto returns result as array)
      let reductoData = null;
      if (Array.isArray(reductoResponse.result) && reductoResponse.result.length > 0) {
        reductoData = reductoResponse.result[0];
        console.log('📦 Using result[0] from array');
      } else if (reductoResponse.result && !Array.isArray(reductoResponse.result)) {
        reductoData = reductoResponse.result;
        console.log('📦 Using result object');
      } else if (reductoResponse.data) {
        reductoData = reductoResponse.data;
        console.log('📦 Using data object');
      } else {
        reductoData = reductoResponse;
        console.log('📦 Using response directly');
      }

      if (!reductoData) {
        console.warn('⚠️ No valid data found in Reducto response');
        return {};
      }

      console.log('📋 Processing candidate data:', !!reductoData.firstName);

      // Check if data is already in our expected format (direct from schema)
      const isDirectFormat = reductoData.firstName !== undefined || reductoData.lastName !== undefined ||
                            reductoData.email !== undefined || reductoData.phone !== undefined;

      let firstName, lastName, email, phone, skills;

      if (isDirectFormat) {
        // Data is already in our expected format from the schema
        console.log('📋 Using direct format from schema');
        firstName = reductoData.firstName || null;
        lastName = reductoData.lastName || null;
        email = reductoData.email || null;
        phone = reductoData.phone || null;
        skills = Array.isArray(reductoData.skills) ? reductoData.skills : [];
      } else {
        // Legacy format processing
        console.log('📋 Using legacy format processing');

        // Split full name into firstName and lastName
        firstName = null;
        lastName = null;
        if (reductoData.full_name) {
          const nameParts = reductoData.full_name.trim().split(/\s+/);
          if (nameParts.length >= 2) {
            firstName = nameParts[0];
            lastName = nameParts.slice(1).join(' ');
          } else if (nameParts.length === 1) {
            firstName = nameParts[0];
          }
        }

        // Extract contact info from contact_info object
        const contactInfo = reductoData.contact_info || {};
        email = contactInfo.email || null;
        phone = contactInfo.phone_number || null;
        if (phone) {
          // Clean phone number - remove +91, spaces, dashes
          phone = phone.replace(/\+91[- ]?/g, '').replace(/[^\d]/g, '');
        }

        // Extract skills from technical_skills nested structure
        skills = [];
        if (reductoData.technical_skills) {
          // Flatten all skill categories
          Object.values(reductoData.technical_skills).forEach(skillCategory => {
            if (Array.isArray(skillCategory)) {
              skillCategory.forEach(skillObj => {
                if (skillObj.skill) {
                  skills.push(skillObj.skill);
                }
              });
            }
          });
        }
      }

      let currentCompany, currentDesignation, currentLocation, experienceYears, experienceMonths;

      if (isDirectFormat) {
        // Direct format from schema
        currentCompany = reductoData.currentCompany || null;
        currentDesignation = reductoData.currentDesignation || null;
        currentLocation = reductoData.currentLocation || null;
        experienceYears = reductoData.experienceYears || null;
        experienceMonths = reductoData.experienceMonths || null;
      } else {
        // Legacy format processing
        // Extract current company and designation from experience array (only if present)
        currentCompany = null;
        currentDesignation = null;

        if (reductoData.experience && Array.isArray(reductoData.experience) && reductoData.experience.length > 0) {
          const latestJob = reductoData.experience[0];
          currentCompany = latestJob.company_name || null;
          currentDesignation = latestJob.role || null;
        }

        // Experience calculation - VERY conservative approach
        experienceYears = null;
        experienceMonths = null;

        // Method 1: Only use explicit experience statements
        // (This would be extracted from resume text analysis, not implemented here)

        // Method 2: Calculate from work history ONLY if we have complete, accurate data
        // This is risky and often inaccurate, so we skip it unless all conditions are met:
        // - All jobs have clear start and end dates
        // - No gaps or overlaps
        // - No "present" dates that could be inaccurate
        // For now, we leave experience as null to avoid unreliable calculations

        // Extract location from contact_info
        currentLocation = contactInfo.location || null;
      }

      // Build notes focusing on reliable information only
      let notes;

      if (isDirectFormat && reductoData.notes) {
        // Use the AI-generated notes from direct format
        notes = reductoData.notes;
      } else {
        // Build notes from legacy format or when notes are not available
        const notesParts = [];

        // Primary information that's usually reliable
        if (skills.length > 0) {
          notesParts.push(`Skills: ${skills.slice(0, 6).join(', ')}${skills.length > 6 ? '...' : ''}`);
        }

        if (currentCompany) {
          notesParts.push(`Currently at: ${currentCompany}`);
        }

        // Only include experience if explicitly available
        if (experienceYears !== null && experienceYears > 0) {
          notesParts.push(`${experienceYears} years experience`);
        }

        // Education if available (usually reliable)
        if (reductoData.education && Array.isArray(reductoData.education) && reductoData.education.length > 0) {
          const latestEdu = reductoData.education[0];
          const degree = latestEdu.degree_level || 'Degree';
          notesParts.push(`${degree}`);
        }

        notes = notesParts.length > 0
          ? `Resume parsed successfully using Reducto AI. ${notesParts.join(' • ')}`
          : 'Resume parsed successfully using Reducto AI.';
      }

      console.log('✅ Transformation complete:', {
        name: `${firstName || ''} ${lastName || ''}`.trim(),
        email: !!email,
        phone: !!phone,
        skillsCount: skills.length,
        experience: `${experienceYears || 0}y ${experienceMonths || 0}m`,
        company: currentCompany,
        location: currentLocation
      });

      return {
        firstName,
        lastName,
        email,
        phone,
        alternatePhone: null,
        appliedFor: null,
        currentLocation,
        preferredLocation: [],
        source: 'other',
        experienceYears,
        experienceMonths,
        currentCompany,
        currentDesignation,
        currentCTC: null,
        expectedCTC: null,
        noticePeriod: null,
        skills: [...new Set(skills)], // Remove duplicates
        stage: null,
        notes,
        rawText: '', // Reducto doesn't return raw text
        // Store additional Reducto data for future use
        _reductoData: {
          education: reductoData.education || [],
          certifications: reductoData.certifications || [],
          projects: reductoData.projects || [],
          leadership: reductoData.leadership_extracurricular || [],
          publications: reductoData.research_publications || [],
          achievements: reductoData.other_achievements || []
        }
      };
    } catch (error) {
      console.error('❌ Error transforming Reducto response:', error);
      console.error('❌ Error details:', error.message);
      return {};
    }
  }

  /**
   * Parse date string in various formats used by Reducto
   * @param {string} dateStr - Date string to parse
   * @returns {Date|null} - Parsed date or null
   */
  parseDateString(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;

    const trimmed = dateStr.trim();

    try {
      // Handle YYYY-MM-DD format (e.g., "2025-06-02")
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const date = new Date(trimmed);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }

      // Handle "Month YYYY" format (e.g., "September 2022", "May 2026")
      const monthYearMatch = trimmed.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i);
      if (monthYearMatch) {
        const monthName = monthYearMatch[1];
        const year = parseInt(monthYearMatch[2]);

        const monthIndex = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ].findIndex(m => m.toLowerCase() === monthName.toLowerCase());

        if (monthIndex !== -1 && !isNaN(year)) {
          return new Date(year, monthIndex, 1);
        }
      }

      // Handle "Expected Month YYYY" format (e.g., "Expected May 2026")
      const expectedMatch = trimmed.match(/^Expected\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i);
      if (expectedMatch) {
        const monthName = expectedMatch[1];
        const year = parseInt(expectedMatch[2]);

        const monthIndex = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ].findIndex(m => m.toLowerCase() === monthName.toLowerCase());

        if (monthIndex !== -1 && !isNaN(year)) {
          return new Date(year, monthIndex, 1);
        }
      }

      // Handle just year format (e.g., "2022")
      if (/^\d{4}$/.test(trimmed)) {
        const year = parseInt(trimmed);
        if (!isNaN(year) && year > 1900 && year < 2100) {
          return new Date(year, 0, 1); // January 1st of that year
        }
      }

      // Handle MM/YYYY format (e.g., "06/2025")
      if (/^\d{1,2}\/\d{4}$/.test(trimmed)) {
        const parts = trimmed.split('/');
        if (parts.length === 2) {
          const month = parseInt(parts[0]) - 1; // Month is 0-indexed
          const year = parseInt(parts[1]);
          if (!isNaN(month) && !isNaN(year) && month >= 0 && month <= 11) {
            return new Date(year, month, 1);
          }
        }
      }

      // Handle YYYY-MM format (e.g., "2025-06")
      if (/^\d{4}-\d{2}$/.test(trimmed)) {
        const parts = trimmed.split('-');
        if (parts.length === 2) {
          const year = parseInt(parts[0]);
          const month = parseInt(parts[1]) - 1;
          if (!isNaN(year) && !isNaN(month) && month >= 0 && month <= 11) {
            return new Date(year, month, 1);
          }
        }
      }

      // Try standard date parsing as last resort
      const date = new Date(trimmed);
      if (!isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
        return date;
      }
    } catch (error) {
      console.warn('Failed to parse date:', trimmed, error.message);
    }

    console.warn('Could not parse date string:', trimmed);
    return null;
  }

  /**
   * Comprehensive data validation and normalization for extracted resume data
   * @param {Object} reductoData - Raw data from Reducto API
   * @returns {Object} - Normalized and validated candidate data
   */
  normalizeData(reductoData) {
    const normalized = { ...reductoData };
    const validationErrors = [];

    try {
      // 1. Normalize and validate names
      normalized.firstName = this.normalizeName(normalized.firstName, 'firstName', validationErrors);
      normalized.lastName = this.normalizeName(normalized.lastName, 'lastName', validationErrors);

      // 2. Normalize and validate contact information
      normalized.email = this.normalizeEmail(normalized.email, validationErrors);
      normalized.phone = this.normalizePhone(normalized.phone, 'phone', validationErrors);
      normalized.alternatePhone = this.normalizePhone(normalized.alternatePhone, 'alternatePhone', validationErrors);

      // 3. Normalize and validate location data
      normalized.currentLocation = this.normalizeLocation(normalized.currentLocation, 'currentLocation', validationErrors);
      normalized.preferredLocation = this.normalizeLocation(normalized.preferredLocation, 'preferredLocation', validationErrors);

      // 4. Normalize and validate professional information
      normalized.currentCompany = this.normalizeCompanyName(normalized.currentCompany, validationErrors);
      normalized.currentDesignation = this.normalizeJobTitle(normalized.currentDesignation, validationErrors);
      normalized.appliedFor = this.normalizeJobTitle(normalized.appliedFor, validationErrors);

      // 5. Normalize and validate experience data
      const experienceResult = this.normalizeExperience(
        normalized.experienceYears,
        normalized.experienceMonths,
        validationErrors
      );
      normalized.experienceYears = experienceResult.years;
      normalized.experienceMonths = experienceResult.months;

      // 6. Normalize and validate salary information
      normalized.currentCTC = this.normalizeSalary(normalized.currentCTC, 'currentCTC', validationErrors);
      normalized.expectedCTC = this.normalizeSalary(normalized.expectedCTC, 'expectedCTC', validationErrors);

      // 7. Normalize and validate notice period
      normalized.noticePeriod = this.normalizeNoticePeriod(normalized.noticePeriod, validationErrors);

      // 8. Normalize and validate skills
      normalized.skills = this.normalizeSkills(normalized.skills, validationErrors);

      // 9. Normalize and validate source
      normalized.source = this.normalizeSource(normalized.source, validationErrors);

      // 10. Normalize and validate notes
      normalized.notes = this.normalizeNotes(normalized.notes, validationErrors);

      // 11. Ensure stage is always null
      normalized.stage = null;

      // Log validation errors if any
      if (validationErrors.length > 0) {
        console.warn(`⚠️ Data validation issues found: ${validationErrors.length} errors`);
        validationErrors.forEach(error => console.warn(`  - ${error}`));
      }

      return normalized;

    } catch (error) {
      console.error('❌ Critical error during data normalization:', error);
      // Return a safe fallback structure
      return this.createFallbackData(reductoData);
    }
  }

  /**
   * Normalize name fields with proper casing and validation
   * @param {string} name - Raw name value
   * @param {string} fieldName - Field name for logging
   * @param {Array} errors - Error collection array
   * @returns {string|null} - Normalized name
   */
  normalizeName(name, fieldName, errors) {
    if (!name || typeof name !== 'string') {
      return null;
    }

    const trimmed = name.trim();

    if (trimmed === '') {
      return null;
    }

    // Validate name length and characters
    if (trimmed.length < 2 || trimmed.length > 50) {
      errors.push(`${fieldName}: Invalid length (${trimmed.length})`);
      return null;
    }

    // Check for valid name characters (allow letters, spaces, hyphens, apostrophes)
    if (!/^[a-zA-Z\s\-']+$/.test(trimmed)) {
      errors.push(`${fieldName}: Contains invalid characters`);
      return null;
    }

    // Proper case conversion
    return trimmed.split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Normalize email with validation
   * @param {string} email - Raw email value
   * @param {Array} errors - Error collection array
   * @returns {string|null} - Normalized email
   */
  normalizeEmail(email, errors) {
    if (!email || typeof email !== 'string') {
      return null;
    }

    const trimmed = email.trim().toLowerCase();

    if (trimmed === '') {
      return null;
    }

    // Basic email validation regex
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    if (!emailRegex.test(trimmed)) {
      errors.push(`email: Invalid email format`);
      return null;
    }

    return trimmed;
  }

  /**
   * Normalize phone numbers to digits only
   * @param {string} phone - Raw phone value
   * @param {string} fieldName - Field name for logging
   * @param {Array} errors - Error collection array
   * @returns {string|null} - Normalized phone
   */
  normalizePhone(phone, fieldName, errors) {
    if (!phone || typeof phone !== 'string') {
      return null;
    }

    // Remove all non-digit characters
    const digitsOnly = phone.replace(/[^\d]/g, '');

    if (digitsOnly === '') {
      return null;
    }

    // Validate phone number length (Indian mobile numbers are 10 digits)
    if (digitsOnly.length < 10 || digitsOnly.length > 15) {
      errors.push(`${fieldName}: Invalid phone number length (${digitsOnly.length} digits)`);
      return null;
    }

    return digitsOnly;
  }

  /**
   * Normalize location strings
   * @param {string} location - Raw location value
   * @param {string} fieldName - Field name for logging
   * @param {Array} errors - Error collection array
   * @returns {string|null} - Normalized location
   */
  normalizeLocation(location, fieldName, errors) {
    if (!location || typeof location !== 'string') {
      return null;
    }

    const trimmed = location.trim();

    if (trimmed === '') {
      return null;
    }

    // Validate length
    if (trimmed.length > 100) {
      errors.push(`${fieldName}: Location too long (${trimmed.length} characters)`);
      return null;
    }

    // Capitalize first letter of each word
    return trimmed.split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Normalize company names
   * @param {string} company - Raw company value
   * @param {Array} errors - Error collection array
   * @returns {string|null} - Normalized company name
   */
  normalizeCompanyName(company, errors) {
    if (!company || typeof company !== 'string') {
      return null;
    }

    const trimmed = company.trim();

    if (trimmed === '') {
      return null;
    }

    // Validate length
    if (trimmed.length > 100) {
      errors.push(`currentCompany: Company name too long (${trimmed.length} characters)`);
      return null;
    }

    // Clean up common issues
    let normalized = trimmed
      .replace(/\s+/g, ' ')  // Multiple spaces to single
      .replace(/,$/, '');   // Remove trailing comma

    // Title case for company names (but keep acronyms uppercase)
    normalized = normalized.split(' ')
      .map(word => {
        // Keep common acronyms uppercase
        if (/^(Ltd|Inc|Corp|LLC|Pvt\.?\s*Ltd|Pvt|Pvt\.|Private\s*Limited|Limited|Company|Technologies|Systems|Solutions|Services|Group|Industries|Labs|Software|Consulting|IT\s*Services|IT\s*Solutions)$/i.test(word)) {
          return word.toUpperCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');

    return normalized;
  }

  /**
   * Normalize job titles/designations
   * @param {string} title - Raw job title value
   * @param {Array} errors - Error collection array
   * @returns {string|null} - Normalized job title
   */
  normalizeJobTitle(title, errors) {
    if (!title || typeof title !== 'string') {
      return null;
    }

    const trimmed = title.trim();

    if (trimmed === '') {
      return null;
    }

    // Validate length
    if (trimmed.length > 100) {
      errors.push(`jobTitle: Title too long (${trimmed.length} characters)`);
      return null;
    }

    // Title case for job titles
    return trimmed.split(/\s+/)
      .map(word => {
        // Keep common abbreviations uppercase
        if (/^(IT|HR|CEO|CFO|CTO|VP|GM|SM|TL|PM|QA|UI|UX|API|SQL|AWS|GCP|Azure)$/i.test(word)) {
          return word.toUpperCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  }

  /**
   * Normalize experience data
   * @param {*} years - Raw years value
   * @param {*} months - Raw months value
   * @param {Array} errors - Error collection array
   * @returns {Object} - Normalized experience {years, months}
   */
  normalizeExperience(years, months, errors) {
    let normalizedYears = null;
    let normalizedMonths = null;

    // Normalize years
    if (years !== null && years !== undefined && years !== '') {
      const parsedYears = typeof years === 'number' ? years : parseFloat(years);
      if (!isNaN(parsedYears) && parsedYears >= 0 && parsedYears <= 50) {
        normalizedYears = Math.floor(parsedYears);
      } else {
        errors.push(`experienceYears: Invalid value (${years})`);
      }
    }

    // Normalize months
    if (months !== null && months !== undefined && months !== '') {
      const parsedMonths = typeof months === 'number' ? months : parseInt(months);
      if (!isNaN(parsedMonths) && parsedMonths >= 0 && parsedMonths <= 11) {
        normalizedMonths = parsedMonths;
      } else {
        errors.push(`experienceMonths: Invalid value (${months})`);
      }
    }

    return { years: normalizedYears, months: normalizedMonths };
  }

  /**
   * Normalize salary values
   * @param {*} salary - Raw salary value
   * @param {string} fieldName - Field name for logging
   * @param {Array} errors - Error collection array
   * @returns {number|null} - Normalized salary in rupees
   */
  normalizeSalary(salary, fieldName, errors) {
    if (salary === null || salary === undefined || salary === '') {
      return null;
    }

    let numericValue = null;

    if (typeof salary === 'number') {
      numericValue = salary;
    } else if (typeof salary === 'string') {
      const salaryStr = salary.toLowerCase().trim();

      // Handle LPA (Lakhs Per Annum)
      if (salaryStr.includes('lpa') || salaryStr.includes('lakhs')) {
        const lpaMatch = salaryStr.match(/(\d+(?:\.\d+)?)/);
        if (lpaMatch) {
          const lpa = parseFloat(lpaMatch[1]);
          if (!isNaN(lpa) && lpa >= 0 && lpa <= 1000) { // Reasonable LPA range
            numericValue = lpa * 100000; // Convert to rupees
          }
        }
      } else {
        // Handle direct amounts (remove commas and extract numbers)
        const amountMatch = salaryStr.match(/(\d+(?:,\d+)*(?:\.\d+)?)/);
        if (amountMatch) {
          const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
          if (!isNaN(amount) && amount >= 0 && amount <= 100000000) { // Reasonable salary range
            numericValue = amount;
          }
        }
      }
    }

    if (numericValue === null) {
      errors.push(`${fieldName}: Invalid salary value (${salary})`);
    }

    return numericValue;
  }

  /**
   * Normalize notice period
   * @param {string} noticePeriod - Raw notice period value
   * @param {Array} errors - Error collection array
   * @returns {string|null} - Normalized notice period
   */
  normalizeNoticePeriod(noticePeriod, errors) {
    if (!noticePeriod || typeof noticePeriod !== 'string') {
      return null;
    }

    const trimmed = noticePeriod.trim();

    if (trimmed === '') {
      return null;
    }

    // Standardize common formats
    const lowerTrimmed = trimmed.toLowerCase();

    if (lowerTrimmed === 'immediate' || lowerTrimmed === 'immediately') {
      return 'Immediate';
    }

    // Extract number and unit
    const match = lowerTrimmed.match(/(\d+)\s*(day|month|week)s?/);
    if (match) {
      const number = parseInt(match[1]);
      const unit = match[2];

      if (unit === 'day' && number >= 1 && number <= 90) {
        return `${number} Day${number > 1 ? 's' : ''}`;
      } else if (unit === 'month' && number >= 1 && number <= 12) {
        return `${number} Month${number > 1 ? 's' : ''}`;
      } else if (unit === 'week' && number >= 1 && number <= 12) {
        return `${number * 7} Days`; // Convert to days
      }
    }

    errors.push(`noticePeriod: Invalid format (${trimmed})`);
    return null;
  }

  /**
   * Normalize skills array
   * @param {*} skills - Raw skills value
   * @param {Array} errors - Error collection array
   * @returns {Array} - Normalized skills array
   */
  normalizeSkills(skills, errors) {
    if (!skills) {
      return [];
    }

    if (!Array.isArray(skills)) {
      errors.push(`skills: Expected array, got ${typeof skills}`);
      return [];
    }

    const normalizedSkills = [];

    for (const skill of skills) {
      if (typeof skill === 'string') {
        const trimmed = skill.trim();

        if (trimmed !== '' && trimmed.length <= 50) {
          // Standardize common skill names
          const standardized = this.standardizeSkillName(trimmed);
          if (standardized && !normalizedSkills.includes(standardized)) {
            normalizedSkills.push(standardized);
          }
        }
      }
    }

    // Limit to reasonable number of skills
    if (normalizedSkills.length > 50) {
      errors.push(`skills: Too many skills (${normalizedSkills.length}), limiting to 50`);
      return normalizedSkills.slice(0, 50);
    }

    return normalizedSkills;
  }

  /**
   * Standardize skill names to common formats
   * @param {string} skill - Raw skill name
   * @returns {string} - Standardized skill name
   */
  standardizeSkillName(skill) {
    const skillMap = {
      // JavaScript variations
      'javascript': 'JavaScript',
      'js': 'JavaScript',
      'es6': 'JavaScript',

      // Python variations
      'python3': 'Python',
      'python2': 'Python',

      // Database variations
      'mongodb': 'MongoDB',
      'postgres': 'PostgreSQL',
      'mysql': 'MySQL',
      'sql server': 'SQL Server',
      'mssql': 'SQL Server',

      // Cloud variations
      'amazon web services': 'AWS',
      'google cloud platform': 'GCP',
      'microsoft azure': 'Azure',

      // Framework variations
      'react.js': 'React',
      'reactjs': 'React',
      'vue.js': 'Vue.js',
      'vuejs': 'Vue.js',
      'angularjs': 'Angular',
      'angular.js': 'Angular',

      // Development practices
      'ci/cd': 'CI/CD',
      'ci cd': 'CI/CD',
      'agile methodology': 'Agile',
      'scrum master': 'Scrum'
    };

    const lowerSkill = skill.toLowerCase().trim();
    return skillMap[lowerSkill] || skill.charAt(0).toUpperCase() + skill.slice(1).toLowerCase();
  }

  /**
   * Normalize source field
   * @param {string} source - Raw source value
   * @param {Array} errors - Error collection array
   * @returns {string} - Normalized source
   */
  normalizeSource(source, errors) {
    const validSources = ['internal', 'linkedin', 'naukri', 'referral', 'job-portal', 'walk-in', 'other'];

    if (!source || typeof source !== 'string') {
      return 'other';
    }

    const normalizedSource = source.toLowerCase().trim();

    if (validSources.includes(normalizedSource)) {
      return normalizedSource;
    }

    // Map common variations
    const sourceMap = {
      'linked in': 'linkedin',
      'linked-in': 'linkedin',
      'linked_in': 'linkedin',
      'monster': 'job-portal',
      'indeed': 'job-portal',
      'glassdoor': 'job-portal',
      'referrals': 'referral',
      'employee referral': 'referral'
    };

    return sourceMap[normalizedSource] || 'other';
  }

  /**
   * Normalize notes field
   * @param {string} notes - Raw notes value
   * @param {Array} errors - Error collection array
   * @returns {string|null} - Normalized notes
   */
  normalizeNotes(notes, errors) {
    if (!notes || typeof notes !== 'string') {
      return null;
    }

    const trimmed = notes.trim();

    if (trimmed === '') {
      return null;
    }

    // Limit notes length
    if (trimmed.length > 1000) {
      errors.push(`notes: Too long (${trimmed.length} characters), truncating to 1000`);
      return trimmed.substring(0, 1000) + '...';
    }

    return trimmed;
  }

  /**
   * Create fallback data structure when normalization fails critically
   * @param {Object} originalData - Original data from Reducto
   * @returns {Object} - Safe fallback data structure
   */
  createFallbackData(originalData) {
    return {
      firstName: null,
      lastName: null,
      email: null,
      phone: null,
      alternatePhone: null,
      appliedFor: null,
      currentLocation: null,
      preferredLocation: null,
      source: 'other',
      experienceYears: null,
      experienceMonths: null,
      currentCompany: null,
      currentDesignation: null,
      currentCTC: null,
      expectedCTC: null,
      noticePeriod: null,
      skills: [],
      stage: null,
      notes: 'Resume data extraction failed due to processing error. Manual data entry required.'
    };
  }

  /**
   * Validate normalized data structure
   * @param {Object} data - Normalized data to validate
   */
  validateNormalizedData(data) {
    // Only validate the essential fields that can be reliably extracted from resumes
    const requiredFields = ['firstName', 'lastName', 'email', 'phone', 'currentLocation', 'skills'];

    for (const field of requiredFields) {
      if (!(field in data)) {
        console.warn(`⚠️ Missing required field in normalized data: ${field}`);
      }
    }

    // Validate data types
    if (data.experienceYears !== null && typeof data.experienceYears !== 'number') {
      console.warn(`⚠️ experienceYears should be number or null, got ${typeof data.experienceYears}`);
    }

    if (data.skills && !Array.isArray(data.skills)) {
      console.warn(`⚠️ skills should be array, got ${typeof data.skills}`);
    }
  }

  /**
   * Create standardized error response
   * @param {Error} error - The error that occurred
   * @param {string} errorType - Type of error
   * @param {number} startTime - When processing started
   * @returns {Object} - Error response
   */
  createErrorResponse(error, errorType, startTime) {
    const processingTime = Date.now() - startTime;

    let errorMessage = 'Unknown error occurred';
    let statusCode = null;
    let errorCode = null;

    if (error) {
      errorMessage = error.response?.data?.error?.message ||
                    error.response?.data?.message ||
                    error.message ||
                    'Unknown error from Reducto API';

      statusCode = error.response?.status;
      errorCode = error.code;
    }

    return {
      success: false,
      error: errorMessage,
      errorType: errorType,
      data: null,
      rawText: '',
      confidence: {},
      metadata: {
        parsedAt: new Date(),
        version: '2.0',
        source: 'reducto',
        processingTime: processingTime,
        error: errorMessage,
        errorType: errorType,
        errorCode: errorCode,
        statusCode: statusCode,
        responseData: error.response?.data
      }
    };
  }

  /**
   * Update average processing time metric
   * @param {number} processingTime - Time taken for processing
   */
  updateAverageProcessingTime(processingTime) {
    const currentAvg = this.metrics.averageProcessingTime;
    const totalRequests = this.metrics.totalRequests;

    // Calculate running average
    this.metrics.averageProcessingTime = ((currentAvg * (totalRequests - 1)) + processingTime) / totalRequests;
  }

  /**
   * Log performance metrics
   * @param {number} startTime - When processing started
   * @param {boolean} success - Whether processing was successful
   * @param {number} attempts - Number of attempts made
   */
  logMetrics(startTime, success, attempts) {
    const processingTime = Date.now() - startTime;
    this.metrics.successfulRequests += success ? 1 : 0;
    this.metrics.failedRequests += success ? 0 : 1;
    this.updateAverageProcessingTime(processingTime);

    console.log(`📊 Resume parsing metrics: success=${success}, attempts=${attempts}, time=${processingTime}ms`);
  }

  /**
   * Generate cache key for file
   * @param {string} filePath - Path to file
   * @returns {string} - Cache key
   */
  generateCacheKey(filePath) {
    try {
      const stats = fs.statSync(filePath);
      const hash = crypto.createHash('md5');
      hash.update(filePath);
      hash.update(stats.mtime.getTime().toString());
      hash.update(stats.size.toString());
      return hash.digest('hex');
    } catch (error) {
      // Fallback to file path hash only
      return crypto.createHash('md5').update(filePath).digest('hex');
    }
  }

  /**
   * Check if result is cached
   * @param {string} cacheKey - Cache key
   * @returns {Object|null} - Cached result or null
   */
  getCachedResult(cacheKey) {
    if (!this.enableCache) return null;

    const cached = this.cache.get(cacheKey);
    if (!cached) {
      this.metrics.cacheMisses++;
      return null;
    }

    // Check if cache entry is expired
    if (Date.now() - cached.timestamp > this.cacheTtl) {
      this.cache.delete(cacheKey);
      this.metrics.cacheMisses++;
      return null;
    }

    this.metrics.cacheHits++;
    console.log(`✅ Cache hit for key: ${cacheKey.substring(0, 8)}...`);
    return cached.data;
  }

  /**
   * Cache result
   * @param {string} cacheKey - Cache key
   * @param {Object} data - Data to cache
   */
  setCachedResult(cacheKey, data) {
    if (!this.enableCache) return;

    this.cache.set(cacheKey, {
      data: data,
      timestamp: Date.now()
    });

    console.log(`💾 Cached result for key: ${cacheKey.substring(0, 8)}...`);
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache() {
    if (!this.enableCache) return;

    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTtl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache stats
   */
  getCacheStats() {
    return {
      enabled: this.enableCache,
      size: this.cache.size,
      ttl: this.cacheTtl,
      hits: this.metrics.cacheHits,
      misses: this.metrics.cacheMisses,
      hitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0
    };
  }

  /**
   * Process request with queue management for rate limiting
   * @param {Function} processor - Async function to process
   * @returns {Promise} - Processing result
   */
  async processWithQueue(processor) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ processor, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process queued requests with concurrency control
   */
  async processQueue() {
    if (this.activeRequests >= this.maxConcurrentRequests || this.requestQueue.length === 0) {
      return;
    }

    while (this.activeRequests < this.maxConcurrentRequests && this.requestQueue.length > 0) {
      const { processor, resolve, reject } = this.requestQueue.shift();
      this.activeRequests++;

      try {
        const result = await processor();
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        this.activeRequests--;
        // Process next item in queue after a small delay
        setTimeout(() => this.processQueue(), 100);
      }
    }
  }

  /**
   * Parse resume using Reducto API with production-level error handling, retries, and caching
   * @param {string} filePath - Path to the resume file
   * @returns {Promise<Object>} - Parsed candidate data
   */
  async parseResumeCached(filePath) {
    const cacheKey = this.generateCacheKey(filePath);
    const cachedResult = this.getCachedResult(cacheKey);

    if (cachedResult) {
      return {
        ...cachedResult,
        metadata: {
          ...cachedResult.metadata,
          cached: true,
          cacheKey: cacheKey
        }
      };
    }

    // Process with queue management for rate limiting
    return this.processWithQueue(async () => {
      const result = await this.parseResume(filePath);

      // Cache successful results
      if (result.success) {
        this.setCachedResult(cacheKey, result);
      }

      return result;
    });
  }

  /**
   * Batch process multiple resumes
   * @param {Array<string>} filePaths - Array of file paths
   * @returns {Promise<Array<Object>>} - Array of processing results
   */
  async batchParseResumes(filePaths) {
    if (!this.enableBatchProcessing || filePaths.length <= 1) {
      // Fall back to individual processing
      const results = [];
      for (const filePath of filePaths) {
        try {
          const result = await this.parseResumeCached(filePath);
          results.push(result);
        } catch (error) {
          results.push(this.createErrorResponse(error, 'BATCH_PROCESSING_ERROR', Date.now()));
        }
      }
      return results;
    }

    console.log(`🔄 Starting batch processing of ${filePaths.length} resumes`);

    // Split into batches
    const batches = [];
    for (let i = 0; i < filePaths.length; i += this.batchSize) {
      batches.push(filePaths.slice(i, i + this.batchSize));
    }

    const allResults = [];

    for (const batch of batches) {
      console.log(`📦 Processing batch of ${batch.length} resumes`);

      // Process batch concurrently with rate limiting
      const batchPromises = batch.map(filePath => this.parseResumeCached(filePath));
      const batchResults = await Promise.allSettled(batchPromises);

      // Convert results and handle errors
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          allResults.push(result.value);
        } else {
          allResults.push(this.createErrorResponse(
            result.reason,
            'BATCH_ITEM_ERROR',
            Date.now()
          ));
        }
      }

      // Small delay between batches to avoid overwhelming the API
      if (batches.length > 1) {
        await this.sleep(500);
      }
    }

    console.log(`✅ Batch processing completed: ${allResults.filter(r => r.success).length}/${allResults.length} successful`);
    return allResults;
  }

  /**
   * Utility method for delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} - Promise that resolves after delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get performance metrics
   * @returns {Object} - Performance metrics
   */
  getMetrics() {
    const totalRequests = this.metrics.totalRequests;
    const successRate = totalRequests > 0 ? (this.metrics.successfulRequests / totalRequests) * 100 : 0;

    return {
      ...this.metrics,
      successRate: `${successRate.toFixed(2)}%`,
      cacheStats: this.getCacheStats(),
      queueStats: {
        activeRequests: this.activeRequests,
        queuedRequests: this.requestQueue.length
      },
      uptime: Date.now() - this.metrics.lastReset
    };
  }

  /**
   * Reset metrics (called daily)
   */
  resetMetrics() {
    console.log('📊 Resetting Reducto service metrics');
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageProcessingTime: 0,
      lastReset: Date.now()
    };
  }

  /**
   * Health check for the service
   * @returns {Promise<Object>} - Health status
   */
  async healthCheck() {
    try {
      // Test API connectivity with a minimal request
      const testResponse = await this.axiosInstance.get(
        this.baseUrl.replace('/extract', '/health') || 'https://platform.reducto.ai/health',
        { timeout: 5000 }
      );

      return {
        status: 'healthy',
        apiReachable: true,
        cacheEnabled: this.enableCache,
        cacheSize: this.cache.size,
        metrics: this.getMetrics(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        apiReachable: false,
        error: error.message,
        cacheEnabled: this.enableCache,
        cacheSize: this.cache.size,
        metrics: this.getMetrics(),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get detailed service status and diagnostics
   * @returns {Object} - Detailed service status
   */
  getServiceStatus() {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    return {
      service: 'Reducto Resume Parser',
      version: '2.0',
      status: 'operational',
      uptime: Math.floor(uptime),
      uptimeFormatted: this.formatUptime(uptime),
      configuration: {
        apiKeyConfigured: !!this.apiKey,
        baseUrl: this.baseUrl,
        maxRetries: this.maxRetries,
        timeout: this.timeout,
        maxFileSize: this.maxFileSize,
        supportedFormats: this.supportedFormats,
        cacheEnabled: this.enableCache,
        cacheTtl: this.cacheTtl,
        batchProcessingEnabled: this.enableBatchProcessing,
        batchSize: this.batchSize,
        maxConcurrentRequests: this.maxConcurrentRequests
      },
      performance: {
        cache: this.getCacheStats(),
        metrics: this.getMetrics(),
        memoryUsage: {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
        }
      },
      queue: {
        activeRequests: this.activeRequests,
        queuedRequests: this.requestQueue.length,
        maxConcurrent: this.maxConcurrentRequests
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Format uptime in human readable format
   * @param {number} uptimeSeconds - Uptime in seconds
   * @returns {string} - Formatted uptime
   */
  formatUptime(uptimeSeconds) {
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.join(' ') || '0s';
  }

  /**
   * Clear cache manually
   * @returns {Object} - Cache clearing result
   */
  clearCache() {
    const previousSize = this.cache.size;
    this.cache.clear();
    this.metrics.cacheHits = 0;
    this.metrics.cacheMisses = 0;

    console.log(`🗑️ Cache cleared: ${previousSize} entries removed`);

    return {
      success: true,
      entriesCleared: previousSize,
      message: `Cleared ${previousSize} cache entries`
    };
  }

  /**
   * Force cleanup of expired cache entries
   * @returns {Object} - Cleanup result
   */
  forceCacheCleanup() {
    const previousSize = this.cache.size;
    this.cleanupCache();
    const newSize = this.cache.size;
    const cleaned = previousSize - newSize;

    return {
      success: true,
      entriesCleaned: cleaned,
      remainingEntries: newSize,
      message: `Cleaned ${cleaned} expired cache entries`
    };
  }

  /**
   * Reset all metrics
   * @returns {Object} - Reset result
   */
  resetAllMetrics() {
    const oldMetrics = { ...this.metrics };
    this.resetMetrics();

    return {
      success: true,
      previousMetrics: oldMetrics,
      message: 'All metrics have been reset'
    };
  }

  /**
   * Log structured event for monitoring
   * @param {string} eventType - Type of event
   * @param {Object} data - Event data
   */
  logEvent(eventType, data) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'reducto-resume-parser',
      eventType,
      data,
      metrics: this.getMetrics()
    };

    // In production, this would be sent to a logging service like Winston, ELK stack, etc.
    console.log(`📊 EVENT [${eventType}]:`, JSON.stringify(logEntry, null, 2));

    // Could also emit to monitoring systems
    // this.emit('log', logEntry);
  }

  /**
   * Create monitoring endpoint data
   * @returns {Object} - Monitoring data
   */
  getMonitoringData() {
    return {
      service: 'Reducto Resume Parser',
      health: this.healthCheck(),
      status: this.getServiceStatus(),
      recentActivity: {
        lastProcessedAt: this.metrics.lastProcessedAt || null,
        totalProcessedToday: this.metrics.totalRequests - (this.metrics.requestsAtReset || 0)
      },
      alerts: this.checkForAlerts(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check for system alerts
   * @returns {Array} - Array of alerts
   */
  checkForAlerts() {
    const alerts = [];
    const metrics = this.getMetrics();

    // High error rate alert
    if (metrics.successRate < 80 && metrics.totalRequests > 10) {
      alerts.push({
        level: 'warning',
        message: `Low success rate: ${metrics.successRate}`,
        threshold: '80%',
        current: metrics.successRate
      });
    }

    // High queue alert
    if (this.requestQueue.length > this.maxConcurrentRequests * 2) {
      alerts.push({
        level: 'warning',
        message: `High request queue: ${this.requestQueue.length} queued requests`,
        threshold: `${this.maxConcurrentRequests * 2} requests`,
        current: this.requestQueue.length
      });
    }

    // Cache efficiency alert
    const cacheStats = this.getCacheStats();
    if (cacheStats.hitRate < 0.3 && cacheStats.hits + cacheStats.misses > 20) {
      alerts.push({
        level: 'info',
        message: `Low cache hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}%`,
        threshold: '30%',
        current: `${(cacheStats.hitRate * 100).toFixed(1)}%`
      });
    }

    // Memory usage alert
    const memUsage = process.memoryUsage();
    const memUsageMB = memUsage.heapUsed / 1024 / 1024;
    if (memUsageMB > 500) { // 500MB threshold
      alerts.push({
        level: 'warning',
        message: `High memory usage: ${Math.round(memUsageMB)}MB`,
        threshold: '500MB',
        current: `${Math.round(memUsageMB)}MB`
      });
    }

    return alerts;
  }

  /**
   * Extract candidate data from resume file with caching
   * @param {string} filePath - Path to resume file
   * @returns {Promise<Object>} - Complete extraction result
   */
  async extractCandidateData(filePath) {
    // Use cached version for better performance
    const result = await this.parseResumeCached(filePath);

    if (result.success && result.data) {
      // Data is already normalized in parseResume, but ensure it's still valid
      if (!result.data || Object.keys(result.data).length === 0) {
        console.warn('⚠️ Reducto returned empty data object');
        console.log('Raw result:', JSON.stringify(result, null, 2));
      }
      return result;
    }

    // If Reducto API fails, return error (no local fallback)
    console.log('❌ Reducto API failed - no fallback available');

    return {
      success: false,
      error: result.error || 'Reducto API extraction failed',
      data: {
        firstName: null,
        lastName: null,
        email: null,
        phone: null,
        appliedFor: null,
        currentLocation: null,
        preferredLocation: [],
        source: 'other',
        experienceYears: null,
        experienceMonths: null,
        currentCompany: null,
        currentDesignation: null,
        currentCTC: null,
        expectedCTC: null,
        noticePeriod: null,
        skills: [],
        stage: null,
        notes: `Resume uploaded but Reducto API parsing failed: ${result.error}. Please fill in the candidate details manually.`
      },
      rawText: 'Resume file received but could not be parsed by Reducto API.',
      confidence: {},
      metadata: {
        parsedAt: new Date(),
        version: '2.0',
        source: 'reducto',
        error: result.error,
        message: 'Reducto API failed - manual entry required',
        cached: false
      }
    };
  }
}

module.exports = new ReductoService();