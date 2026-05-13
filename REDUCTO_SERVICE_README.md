# Reducto Resume Parser Service - Production Ready Implementation

## Overview

This document describes the production-ready implementation of resume parsing using Reducto AI for the HRMS (Human Resource Management System) backend. The service provides robust, scalable, and reliable resume parsing with comprehensive error handling, caching, and monitoring capabilities.

## Features

### 🚀 Production-Ready Features
- **Intelligent Retry Logic**: Automatic retry with exponential backoff for failed requests
- **Comprehensive Error Handling**: Graceful degradation and detailed error reporting
- **Performance Caching**: Intelligent caching with TTL and hit rate monitoring
- **Rate Limiting**: Request queue management to prevent API overload
- **Batch Processing**: Efficient processing of multiple resumes concurrently
- **Connection Pooling**: Optimized HTTP connections for high throughput
- **Detailed Monitoring**: Real-time metrics and health checks
- **Data Validation**: Robust data normalization and validation
- **File Type Support**: PDF and DOCX resume parsing
- **Security**: API key protection and request validation

### 📊 Monitoring & Metrics
- Request success/failure rates
- Average processing times
- Cache hit rates and performance
- Queue depth monitoring
- Memory usage tracking
- Health check endpoints

### 🔧 Configuration Options

#### Environment Variables
```bash
# Required
REDUCTO_API_KEY=your-reducto-api-key-here
REDUCTO_BASE_URL=https://platform.reducto.ai

# Performance Tuning
REDUCTO_MAX_RETRIES=3                    # Number of retry attempts
REDUCTO_TIMEOUT=120000                   # Request timeout (ms)
REDUCTO_RETRY_DELAY=2000                 # Delay between retries (ms)
REDUCTO_MAX_FILE_SIZE=10485760           # Max file size (10MB)
REDUCTO_MAX_CONCURRENT=5                 # Max concurrent requests
REDUCTO_BATCH_SIZE=10                    # Batch processing size

# Caching
REDUCTO_ENABLE_CACHE=true               # Enable/disable caching
REDUCTO_CACHE_TTL=3600000               # Cache TTL (1 hour)

# Batch Processing
REDUCTO_ENABLE_BATCH=true               # Enable batch processing
```

## API Endpoints

### Resume Parsing
```http
POST /api/candidates/upload-resume
Content-Type: multipart/form-data

# Request
- resume: File (PDF/DOCX)
- candidateId: String (optional)

# Response
{
  "success": true,
  "data": {
    "firstName": "John",
    "lastName": "Smith",
    "email": "john.smith@email.com",
    "phone": "9876543210",
    "skills": ["JavaScript", "React", "Node.js"],
    "experienceYears": 5,
    "currentCompany": "Tech Corp",
    // ... more fields
  },
  "confidence": {...},
  "metadata": {
    "parsedAt": "2024-01-21T10:30:00Z",
    "source": "reducto",
    "processingTime": 2500
  }
}
```

### Monitoring Endpoints (Admin Only)

#### Health Check
```http
GET /api/ai-analysis/reducto/health
```
Returns basic health status and API connectivity.

#### Service Status
```http
GET /api/ai-analysis/reducto/status
```
Returns detailed service status, configuration, and performance metrics.

#### Performance Metrics
```http
GET /api/ai-analysis/reducto/metrics
```
Returns real-time performance metrics and statistics.

#### Cache Management
```http
POST /api/ai-analysis/reducto/cache/clear    # Clear all cache
POST /api/ai-analysis/reducto/cache/cleanup  # Clean expired entries
```

#### Metrics Management
```http
POST /api/ai-analysis/reducto/metrics/reset  # Reset metrics
GET /api/ai-analysis/reducto/monitoring     # Comprehensive monitoring data
```

## Usage Examples

### Basic Resume Parsing
```javascript
const result = await reductoService.extractCandidateData('/path/to/resume.pdf');

if (result.success) {
  console.log('Parsed data:', result.data);
  console.log('Confidence scores:', result.confidence);
} else {
  console.error('Parsing failed:', result.error);
}
```

### Batch Processing
```javascript
const filePaths = [
  '/path/to/resume1.pdf',
  '/path/to/resume2.pdf',
  '/path/to/resume3.pdf'
];

const results = await reductoService.batchParseResumes(filePaths);

results.forEach((result, index) => {
  if (result.success) {
    console.log(`Resume ${index + 1} parsed successfully`);
  } else {
    console.log(`Resume ${index + 1} failed:`, result.error);
  }
});
```

### Monitoring
```javascript
// Get service health
const health = await reductoService.healthCheck();

// Get detailed metrics
const metrics = reductoService.getMetrics();

// Get service status
const status = reductoService.getServiceStatus();
```

## Optimized Pipeline Architecture

The Reducto service uses a sophisticated two-step pipeline for maximum reliability and performance:

### Step 1: File Upload (`/upload` endpoint)
```
File Upload → Reducto Storage → reducto:// URL Generation
```
- Secure file upload to Reducto infrastructure
- Returns unique `reducto://file_id` URL for processing
- Handles large files efficiently
- Automatic cleanup after processing

### Step 2: Structured Extraction (`/extract` endpoint)
```
reducto:// URL → AI Processing → Schema-based Extraction → Structured JSON
```
- Uses uploaded file URL as input
- Applies custom JSON schema for structured output
- Leverages advanced AI for field extraction
- Returns normalized candidate data

### Pipeline Benefits
- **Separation of Concerns**: Upload ≠ Processing
- **Scalability**: Independent scaling of upload vs extraction
- **Reliability**: File verification before processing
- **Performance**: Optimized for different file sizes
- **Monitoring**: Granular tracking of each step

## Data Schema

### Input Validation
- **File Types**: PDF, DOCX (max 10MB)
- **API Key**: Required for authentication
- **File Existence**: File must exist and be readable

### Output Schema
```javascript
{
  // RELIABLE FIELDS (almost always present in resumes)
  "firstName": "string | null",           // ✓ Reliable
  "lastName": "string | null",            // ✓ Reliable
  "email": "string | null",               // ✓ Reliable
  "phone": "string | null",               // ✓ Reliable
  "currentLocation": "string | null",     // ✓ Reliable
  "skills": ["string"],                   // ✓ Reliable

  // SITUATIONAL FIELDS (present in some resumes)
  "currentCompany": "string | null",      // Sometimes
  "currentDesignation": "string | null",  // Sometimes
  "experienceYears": "number | null",     // Rarely explicit

  // UNRELIABLE FIELDS (rarely present in resumes)
  "alternatePhone": "string | null",      // Rare
  "appliedFor": "string | null",          // Rare
  "preferredLocation": "string | null",   // Rare
  "source": "string | null",              // Rare
  "experienceMonths": "number | null",    // Rare
  "currentCTC": "number | null",          // Rare
  "expectedCTC": "number | null",         // Rare
  "noticePeriod": "string | null",        // Rare

  // SYSTEM FIELDS
  "stage": "string | null", // Always null (system managed)
  "notes": "string | null"  // AI-generated summary
}
```

### Field Extraction Reality

**Reliable Fields (90%+ of resumes):**
- `firstName`, `lastName`, `email`, `phone`, `currentLocation`, `skills`

**Situational Fields (30-60% of resumes):**
- `currentCompany`, `currentDesignation` - Present in recent work experience
- `experienceYears` - Only if explicitly stated (e.g., "5 years experience")

**Unreliable Fields (<20% of resumes):**
- `alternatePhone`, `appliedFor`, `preferredLocation`, `source`
- `currentCTC`, `expectedCTC`, `noticePeriod`
- These are rarely included in standard resumes

**Experience Calculation:**
- **Explicit**: "5 years experience" → extract as-is
- **Calculated**: Only from complete work history with all start/end dates (rare)
- **Missing**: Leave as `null` rather than guessing

## Error Handling

### Error Types
- `VALIDATION_ERROR`: Invalid input parameters
- `MAX_RETRIES_EXCEEDED`: All retry attempts failed
- `UNEXPECTED_ERROR`: Unexpected system error
- `BATCH_PROCESSING_ERROR`: Batch processing failure

### Retry Logic
1. **Attempt 1**: Schema + system prompt
2. **Attempt 2**: Simple file upload
3. **Attempt 3**: Two-step upload + extract

### Fallback Behavior
- Automatic fallback to local parsing (if implemented)
- Graceful error reporting with detailed metadata
- Partial data preservation where possible

## Performance Optimization

### Caching Strategy
- **Key Generation**: File path + modification time + size
- **TTL**: 1 hour (configurable)
- **Invalidation**: Automatic on file change
- **Memory Management**: Automatic cleanup of expired entries

### Rate Limiting
- **Concurrent Requests**: Max 5 simultaneous requests
- **Queue Management**: FIFO queue for request ordering
- **Backpressure**: Prevents API overload

### Connection Pooling
- **Keep-Alive**: Persistent connections
- **Pool Size**: 10 max sockets
- **Timeout**: 120 second request timeout

## Testing

### Running Tests
```bash
# Run comprehensive test suite
node test-reducto-service.js

# Run specific test category
npm test -- --grep "cache"
```

### Test Coverage
- ✅ Service initialization and configuration
- ✅ File validation (valid/invalid files)
- ✅ Data normalization and validation
- ✅ Caching functionality and performance
- ✅ Error handling (network, API key, etc.)
- ✅ Performance metrics and monitoring
- ✅ Concurrent request handling
- ✅ Batch processing capabilities

## Monitoring & Alerting

### Key Metrics to Monitor
- **Success Rate**: Target > 95%
- **Average Processing Time**: Target < 5 seconds
- **Cache Hit Rate**: Target > 70%
- **Error Rate**: Target < 5%
- **Queue Depth**: Alert if > max concurrent

### Alert Conditions
- API connectivity issues
- High error rates (>10%)
- Memory usage > 80%
- Cache hit rate < 50%
- Queue depth > concurrent limit

## Deployment Considerations

### Environment Setup
1. Set `REDUCTO_API_KEY` environment variable
2. Configure optional performance tuning variables
3. Ensure Redis is available (if using Redis caching)
4. Set up monitoring dashboards

### Scaling Considerations
- **Horizontal Scaling**: Multiple service instances
- **Load Balancing**: Distribute requests across instances
- **Database Sharding**: For high-volume deployments
- **CDN Integration**: For file upload optimization

### Security Considerations
- API keys stored as environment variables
- Input validation on all endpoints
- Rate limiting to prevent abuse
- Audit logging for compliance
- File upload size limits

## Troubleshooting

### Common Issues

#### API Key Issues
```
Error: Reducto API key not configured
Solution: Set REDUCTO_API_KEY environment variable
```

#### Network Connectivity
```
Error: DNS/Network Error: Cannot reach Reducto API
Solution: Check internet connectivity and firewall settings
```

#### File Size Issues
```
Error: File size exceeds maximum allowed size
Solution: Reduce file size or increase REDUCTO_MAX_FILE_SIZE
```

#### High Memory Usage
```
Issue: Service consuming excessive memory
Solution: Enable cache cleanup, reduce cache TTL, monitor cache size
```

### Debug Mode
Enable detailed logging by setting:
```bash
DEBUG=reducto:*
```

## Support & Maintenance

### Regular Maintenance Tasks
- Monitor performance metrics weekly
- Review and update cache TTL settings
- Clean up old cache entries
- Update API keys before expiration
- Review error logs for patterns

### Support Contacts
- **Technical Issues**: Development team
- **API Issues**: Reducto AI support
- **Performance Issues**: DevOps team

## Changelog

### Version 2.0 (Current)
- Complete rewrite with production-ready features
- Advanced error handling and retry logic
- Intelligent caching with TTL
- Batch processing capabilities
- Comprehensive monitoring and metrics
- Rate limiting and queue management
- Connection pooling optimization

### Version 1.0
- Basic Reducto API integration
- Simple error handling
- No caching or performance optimization
- Limited monitoring capabilities

---

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp env-example.txt .env
   # Edit .env with your API keys
   ```

3. **Run Tests**
   ```bash
   node test-reducto-service.js
   ```

4. **Start Service**
   ```bash
   npm start
   ```

5. **Monitor Health**
   ```bash
   curl http://localhost:5000/api/ai-analysis/reducto/health
   ```

The service is now ready for production use with comprehensive error handling, monitoring, and performance optimization features.