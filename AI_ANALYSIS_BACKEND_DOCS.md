# AI Candidate Analysis - Backend Documentation

## 📋 Overview

This document details all backend changes made to implement the AI-driven candidate analysis and ranking system in the HRMS application.

---

## 🗂️ Files Modified/Created

### **1. Models**

#### `src/models/Candidate.js` ✏️ Modified
**Changes:**
- Added `aiAnalysis` field to store AI analysis results

**New Schema Fields:**
```javascript
aiAnalysis: {
  matchScore: Number,              // 0-100% overall match
  analysisDate: Date,              // When analysis was performed
  skillsMatch: {
    matched: [String],             // Skills that match job requirements
    missing: [String],             // Required skills candidate lacks
    additional: [String],          // Extra skills candidate has
    matchPercentage: Number        // Percentage of required skills matched
  },
  experienceMatch: {
    isMatch: Boolean,              // Does experience meet requirements
    candidateYears: Number,        // Candidate's total experience
    requiredYears: String,         // Required experience range (e.g., "3-5")
    score: Number                  // Experience match score (0-100)
  },
  keyHighlights: [String],         // Top 3-5 candidate strengths
  weaknesses: [String],            // 2-3 areas of concern
  overallFit: {
    type: String,
    enum: ['excellent', 'good', 'average', 'poor', null]
  },
  resumeInsights: {
    totalExperience: String,       // Formatted experience
    keySkills: [String],           // Top skills from resume
    education: [String],           // Education details
    certifications: [String],      // Certifications (future)
    projects: [String]             // Projects (future)
  },
  semanticScore: Number,           // AI semantic similarity score
  isAnalyzed: Boolean              // Flag indicating analysis completion
}
```

---

### **2. Services**

#### `src/services/aiService.js` ✨ Created
**Purpose:** Core AI analysis logic with DeepSeek and OpenAI support

**Key Methods:**

##### **Constructor**
```javascript
constructor() {
  // DeepSeek Configuration (Primary)
  this.deepseekApiKey = process.env.DEEPSEEK_API_KEY;
  this.deepseekModel = process.env.DEEPSEEK_MODEL || 'deepseek-v3';
  this.embeddingModel = process.env.DEEPSEEK_EMBEDDING_MODEL || 'deepseek-embedding';
  this.baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  
  // OpenAI Configuration (Fallback)
  this.openaiApiKey = process.env.OPENAI_API_KEY;
  this.openaiModel = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
}
```

##### **analyzeCandidate(candidate, jobPosting)**
- Main analysis method
- Returns complete AI analysis object
- Orchestrates all analysis steps

##### **analyzeSkillsMatch(requiredSkills, candidateSkills)**
- Compares job requirements with candidate skills
- Returns matched, missing, and additional skills
- Calculates match percentage

##### **analyzeExperienceMatch(requiredExp, candidateExp)**
- Evaluates experience alignment
- Calculates experience score
- Returns match status and details

##### **calculateSemanticSimilarity(jobDescription, candidateProfile)**
- Uses DeepSeek/OpenAI embeddings for semantic matching
- Falls back to keyword-based matching
- Returns similarity score (0-100)

##### **generateAIInsights(jobPosting, candidate, skillsMatch, experienceMatch)**
- Generates AI-powered insights
- Priority: DeepSeek → OpenAI → Rule-based
- Returns highlights, weaknesses, and overall fit

##### **analyzeCandidatesBatch(candidates, jobPosting, options)**
- Batch processes multiple candidates
- Concurrency control (default: 3)
- Rate limiting with delays

**AI Provider Priority:**
1. **DeepSeek** (Primary) - Free, high-quality
2. **OpenAI** (Fallback) - When DeepSeek unavailable
3. **Rule-based** (Always) - When no APIs configured

---

### **3. Utilities**

#### `src/utils/resumeParser.js` ✨ Created
**Purpose:** Parse and extract data from PDF/DOCX resumes

**Key Methods:**

##### **parsePDF(filePath)**
- Extracts text from PDF files
- Uses `pdf-parse` library

##### **parseDOCX(filePath)**
- Extracts text from DOCX files
- Uses `mammoth` library

##### **parseFromURL(url)**
- Downloads and parses resume from URL
- Supports both PDF and DOCX formats

##### **extractSkills(text)**
- Identifies common technical skills
- Returns array of found skills

##### **extractExperience(text)**
- Extracts years of experience
- Parses patterns like "5 years of experience"

##### **extractEducation(text)**
- Identifies degree information
- Returns education details

##### **parseResume(resumeUrl)**
- Main parsing method
- Returns structured resume data

---

### **4. Controllers**

#### `src/controllers/aiAnalysisController.js` ✨ Created
**Purpose:** API endpoint handlers for AI analysis

**Endpoints:**

##### **POST /api/ai-analysis/candidates/:candidateId/analyze**
```javascript
analyzeSingleCandidate(req, res)
```
- Analyzes a single candidate
- Updates candidate record with results
- Returns analysis data

##### **POST /api/ai-analysis/jobs/:jobId/analyze**
```javascript
analyzeJobCandidates(req, res)
```
- Analyzes all candidates for a job
- Query params: `forceReanalyze` (boolean)
- Batch processes with progress tracking
- Returns success/failure counts

##### **GET /api/ai-analysis/jobs/:jobId/ranked**
```javascript
getRankedCandidates(req, res)
```
- Returns candidates sorted by match score
- Query params: `minScore`, `limit`, `stage`, `status`
- Filters and sorts results

##### **GET /api/ai-analysis/candidates/:candidateId/insights**
```javascript
getCandidateInsights(req, res)
```
- Returns detailed AI insights for a candidate
- Includes job posting details
- Full analysis breakdown

##### **GET /api/ai-analysis/jobs/:jobId/stats**
```javascript
getAnalysisStats(req, res)
```
- Returns aggregate statistics
- Average score, fit distribution
- Total analyzed count

##### **POST /api/ai-analysis/candidates/:candidateId/parse-resume**
```javascript
parseResume(req, res)
```
- Parses candidate's resume
- Extracts structured data
- Returns parsed information

##### **DELETE /api/ai-analysis/jobs/:jobId/clear**
```javascript
clearAnalysis(req, res)
```
- Clears all AI analysis for a job
- Admin only
- Used for testing/reanalysis

---

### **5. Routes**

#### `src/routes/aiAnalysisRoutes.js` ✨ Created
**Purpose:** Route definitions for AI analysis endpoints

**Route Configuration:**
```javascript
const router = express.Router();

// All routes protected with authentication
router.use(protect);

// Analysis endpoints (HR/Admin only)
router.post('/candidates/:candidateId/analyze', authorize('admin', 'hr'), analyzeSingleCandidate);
router.post('/jobs/:jobId/analyze', authorize('admin', 'hr'), analyzeJobCandidates);
router.post('/candidates/:candidateId/parse-resume', authorize('admin', 'hr'), parseResume);
router.delete('/jobs/:jobId/clear', authorize('admin'), clearAnalysis);

// Read-only endpoints (All authenticated users)
router.get('/jobs/:jobId/ranked', getRankedCandidates);
router.get('/candidates/:candidateId/insights', getCandidateInsights);
router.get('/jobs/:jobId/stats', getAnalysisStats);
```

**Registered in `src/app.js`:**
```javascript
const aiAnalysisRoutes = require('./routes/aiAnalysisRoutes');
app.use('/api/ai-analysis', aiAnalysisRoutes);
```

---

### **6. Configuration**

#### `.env` ✏️ Modified
**New Environment Variables:**

```env
# AI Analysis Configuration - DeepSeek (Primary)
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-v3
DEEPSEEK_EMBEDDING_MODEL=deepseek-embedding
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MAX_TOKENS=4096
DEEPSEEK_TEMPERATURE=0.7

# OpenAI Configuration (Fallback - Optional)
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-3.5-turbo
OPENAI_EMBEDDING_MODEL=text-embedding-ada-002
```

#### `.env.example` ✏️ Modified
Updated with DeepSeek configuration template

#### `package.json` ✏️ Modified
**New Dependencies:**
```json
{
  "axios": "^1.6.0",        // HTTP client for API calls
  "pdf-parse": "^1.1.1",    // PDF parsing
  "mammoth": "^1.6.0"       // DOCX parsing
}
```

---

## 🔄 API Flow

### **Analysis Flow**

```
1. Frontend Request
   ↓
2. POST /api/ai-analysis/jobs/:jobId/analyze
   ↓
3. aiAnalysisController.analyzeJobCandidates()
   ↓
4. Fetch candidates and job posting from DB
   ↓
5. aiService.analyzeCandidatesBatch()
   ↓
6. For each candidate:
   - analyzeSkillsMatch()
   - analyzeExperienceMatch()
   - calculateSemanticSimilarity() [if API available]
   - generateAIInsights()
   - calculateMatchScore()
   ↓
7. Save results to candidate.aiAnalysis
   ↓
8. Return success/failure counts
```

### **Ranking Flow**

```
1. Frontend Request
   ↓
2. GET /api/ai-analysis/jobs/:jobId/ranked
   ↓
3. Query candidates with aiAnalysis.isAnalyzed = true
   ↓
4. Sort by aiAnalysis.matchScore (descending)
   ↓
5. Apply filters (minScore, stage, status)
   ↓
6. Return ranked candidates
```

---

## 🧮 Scoring Algorithm

### **Match Score Calculation**

```javascript
matchScore = (skillsScore × 0.5) + (experienceScore × 0.3) + (semanticScore × 0.2)
```

**Weights:**
- Skills: 50%
- Experience: 30%
- Semantic Similarity: 20%

### **Skills Match Score**
```javascript
matchPercentage = (matchedSkills / requiredSkills) × 100
```

### **Experience Match Score**
- **Perfect Match** (within range): 100 points
- **Below Minimum**: Penalize 20 points per year short
- **Above Maximum**: Penalize 10 points per year over

### **Overall Fit Categories**
- **Excellent**: 80-100% match score
- **Good**: 60-79% match score
- **Average**: 40-59% match score
- **Poor**: 0-39% match score

---

## 🔒 Security & Authorization

### **Authentication**
- All routes require valid JWT token
- Middleware: `protect`

### **Authorization Levels**
- **Admin**: Full access to all endpoints
- **HR**: Can analyze and view all data
- **Other Roles**: Read-only access to rankings and stats

### **Protected Actions**
- Analyzing candidates (HR/Admin)
- Parsing resumes (HR/Admin)
- Clearing analysis (Admin only)

---

## 🚀 Performance Optimizations

### **Batch Processing**
- Processes 3 candidates concurrently
- 1-second delay between batches
- Prevents API rate limiting

### **Caching**
- Analysis results stored in database
- `isAnalyzed` flag prevents duplicate processing
- Force reanalysis with `forceReanalyze=true`

### **Database Indexing**
Recommended indexes:
```javascript
// Add to Candidate model
candidateSchema.index({ 'aiAnalysis.matchScore': -1 });
candidateSchema.index({ 'aiAnalysis.isAnalyzed': 1 });
candidateSchema.index({ appliedFor: 1, 'aiAnalysis.matchScore': -1 });
```

### **Error Handling**
- Graceful fallbacks for API failures
- Individual candidate errors don't stop batch
- Detailed error logging

---

## 🧪 Testing

### **Unit Tests** (Recommended)
```javascript
// Test skill matching
describe('analyzeSkillsMatch', () => {
  test('calculates match percentage correctly', () => {
    const required = ['React', 'Node.js', 'MongoDB'];
    const candidate = ['React', 'Node.js', 'Python'];
    const result = aiService.analyzeSkillsMatch(required, candidate);
    expect(result.matchPercentage).toBe(67); // 2/3 = 66.67%
  });
});
```

### **Integration Tests**
```javascript
// Test analysis endpoint
describe('POST /api/ai-analysis/jobs/:jobId/analyze', () => {
  test('analyzes candidates successfully', async () => {
    const response = await request(app)
      .post(`/api/ai-analysis/jobs/${jobId}/analyze`)
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(200);
    expect(response.body.data.analyzed).toBeGreaterThan(0);
  });
});
```

### **Manual Testing**
1. Analyze candidates via API
2. Check database for `aiAnalysis` data
3. Verify rankings are correct
4. Test with/without API keys

---

## 🐛 Troubleshooting

### **Common Issues**

#### **1. Analysis Fails for All Candidates**
**Symptoms:** "0 successful, X failed"

**Causes:**
- Missing required fields in candidates/job
- API key issues
- Database validation errors

**Solutions:**
- Check backend logs for specific errors
- Verify candidate data completeness
- Test API key with curl

#### **2. "analyzeSkillsMatch is not a function"**
**Cause:** Missing methods in aiService.js

**Solution:** Ensure all methods are present in the service file

#### **3. "Cast to Number failed for value '0-999'"**
**Cause:** Schema type mismatch

**Solution:** `requiredYears` should be String, not Number

#### **4. Slow Analysis**
**Causes:**
- Too many concurrent requests
- API rate limiting
- Network latency

**Solutions:**
- Reduce concurrency
- Add delays between batches
- Use caching

---

## 📊 Database Queries

### **Get All Analyzed Candidates**
```javascript
const analyzed = await Candidate.find({
  'aiAnalysis.isAnalyzed': true
});
```

### **Get Top Candidates**
```javascript
const topCandidates = await Candidate.find({
  appliedFor: jobId,
  'aiAnalysis.matchScore': { $gte: 80 }
}).sort({ 'aiAnalysis.matchScore': -1 });
```

### **Get Analysis Statistics**
```javascript
const stats = await Candidate.aggregate([
  { $match: { appliedFor: jobId, 'aiAnalysis.isAnalyzed': true } },
  {
    $group: {
      _id: null,
      avgScore: { $avg: '$aiAnalysis.matchScore' },
      maxScore: { $max: '$aiAnalysis.matchScore' },
      minScore: { $min: '$aiAnalysis.matchScore' },
      count: { $sum: 1 }
    }
  }
]);
```

---

## 🔄 Migration Guide

### **Existing Data**
No migration needed. The `aiAnalysis` field is optional and will be populated on first analysis.

### **Reanalyzing Existing Candidates**
```bash
# Clear existing analysis
DELETE /api/ai-analysis/jobs/:jobId/clear

# Reanalyze
POST /api/ai-analysis/jobs/:jobId/analyze?forceReanalyze=true
```

---

## 📚 Dependencies

### **Production**
- `axios@^1.6.0` - HTTP client
- `pdf-parse@^1.1.1` - PDF parsing
- `mammoth@^1.6.0` - DOCX parsing

### **Existing**
- `express` - Web framework
- `mongoose` - MongoDB ODM
- `dotenv` - Environment variables

---

## 🎯 Future Enhancements

### **Planned Features**
1. **Advanced Resume Parsing**
   - OCR for scanned PDFs
   - Better entity extraction
   - Support for more formats

2. **Background Job Processing**
   - Queue-based analysis (BullMQ)
   - Real-time progress updates
   - Webhook notifications

3. **Custom ML Models**
   - Train on historical hiring data
   - Company-specific ranking
   - Predictive success scoring

4. **Enhanced Insights**
   - Salary expectation analysis
   - Cultural fit assessment
   - Interview question suggestions

---

## 📞 Support

For issues or questions:
1. Check backend logs for detailed errors
2. Review this documentation
3. Check `AI_TESTING_GUIDE.md` for test scenarios
4. Contact development team

---

**Version:** 1.1.0 - DeepSeek Integration  
**Last Updated:** October 2024  
**Maintained by:** HRMS Development Team
