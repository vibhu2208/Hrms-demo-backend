const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const natural = require('natural');
const { getTenantModel } = require('../utils/tenantModels');

class JDParserService {
  constructor() {
    this.supportedFormats = ['pdf', 'docx', 'doc'];
    this.cache = new Map();
    this.processingQueue = [];
    this.maxConcurrent = parseInt(process.env.JD_PARSER_MAX_CONCURRENT) || 3;
    this.activeProcesses = 0;
  }

  /**
   * Parse JD from file path
   * @param {string} filePath - Path to the JD file
   * @param {Object} options - Parsing options
   * @returns {Promise<Object>} Parsed JD data
   */
  async parseJD(filePath, options = {}) {
    try {
      console.log(`📄 Checking file: ${filePath}`);
      
      if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        throw new Error('File not found');
      }

      const fileExt = path.extname(filePath).toLowerCase().replace('.', '');
      console.log(`📝 File extension: ${fileExt}`);
      
      if (!this.supportedFormats.includes(fileExt)) {
        throw new Error(`Unsupported file format: ${fileExt}`);
      }

      // Extract text from file
      console.log(`🔍 Extracting text from ${fileExt.toUpperCase()} file...`);
      const textStartTime = Date.now();
      const rawText = await this.extractTextFromFile(filePath, fileExt);
      console.log(`✅ Text extraction took ${((Date.now() - textStartTime) / 1000).toFixed(2)}s, extracted ${rawText.length} characters`);

      if (!rawText || rawText.trim().length === 0) {
        console.error(`❌ No text content found in file`);
        throw new Error('No text content found in file');
      }

      // Parse the extracted text
      console.log(`🧠 Parsing JD text content...`);
      const parseStartTime = Date.now();
      const parsedData = await this.parseJDText(rawText, options);
      console.log(`✅ JD text parsing took ${((Date.now() - parseStartTime) / 1000).toFixed(2)}s`);

      return {
        success: true,
        data: parsedData,
        metadata: {
          fileName: path.basename(filePath),
          fileSize: fs.statSync(filePath).size,
          mimeType: this.getMimeType(fileExt),
          extractedText: rawText,
          parsingTime: Date.now(),
          parserVersion: '1.0.0'
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        metadata: {
          fileName: path.basename(filePath),
          parsingTime: Date.now()
        }
      };
    }
  }

  /**
   * Extract text from different file formats
   * @param {string} filePath - Path to file
   * @param {string} fileExt - File extension
   * @returns {Promise<string>} Extracted text
   */
  async extractTextFromFile(filePath, fileExt) {
    switch (fileExt) {
      case 'pdf':
        return await this.extractTextFromPDF(filePath);
      case 'docx':
        return await this.extractTextFromDOCX(filePath);
      case 'doc':
        return await this.extractTextFromDOC(filePath);
      default:
        throw new Error(`Unsupported format: ${fileExt}`);
    }
  }

  /**
   * Extract text from PDF file
   * @param {string} filePath - PDF file path
   * @returns {Promise<string>} Extracted text
   */
  async extractTextFromPDF(filePath) {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } catch (error) {
      throw new Error(`PDF parsing failed: ${error.message}`);
    }
  }

  /**
   * Extract text from DOCX file
   * @param {string} filePath - DOCX file path
   * @returns {Promise<string>} Extracted text
   */
  async extractTextFromDOCX(filePath) {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (error) {
      throw new Error(`DOCX parsing failed: ${error.message}`);
    }
  }

  /**
   * Extract text from DOC file (limited support)
   * @param {string} filePath - DOC file path
   * @returns {Promise<string>} Extracted text
   */
  async extractTextFromDOC(filePath) {
    // Note: DOC files have limited support. Consider converting to DOCX first
    throw new Error('DOC format parsing not fully supported. Please convert to DOCX or PDF.');
  }

  /**
   * Parse JD text content and extract structured data
   * @param {string} text - Raw JD text
   * @param {Object} options - Parsing options
   * @returns {Promise<Object>} Parsed JD data
   */
  async parseJDText(text, options = {}) {
    const cleanText = this.preprocessText(text);

    return {
      jobTitle: this.extractJobTitle(cleanText),
      companyName: this.extractCompanyName(cleanText),
      department: this.extractDepartment(cleanText),
      location: this.extractLocation(cleanText),
      employmentType: this.extractEmploymentType(cleanText),
      experienceRequired: this.extractExperienceRequirements(cleanText),
      requiredSkills: [], // Will be populated by structured data
      preferredSkills: [], // Will be populated by structured data
      requiredSkillsSimple: this.extractRequiredSkills(cleanText),
      preferredSkillsSimple: this.extractPreferredSkills(cleanText),
      technologies: this.extractTechnologies(cleanText),
      educationRequirements: [], // Will be populated by structured data
      educationRequirementsSimple: this.extractEducationRequirements(cleanText),
      salaryRange: this.extractSalaryRange(cleanText),
      jobLocation: this.extractJobLocation(cleanText),
      remoteWork: this.extractRemoteWorkPolicy(cleanText),
      preferredLocations: this.extractPreferredLocations(cleanText),
      responsibilities: this.extractResponsibilities(cleanText),
      certifications: this.extractCertifications(cleanText),
      languages: this.extractLanguages(cleanText),
      noticePeriod: this.extractNoticePeriod(cleanText),
      benefits: this.extractBenefits(cleanText),
      perks: this.extractPerks(cleanText)
    };
  }

  /**
   * Preprocess text for better parsing
   * @param {string} text - Raw text
   * @returns {string} Cleaned text
   */
  preprocessText(text) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\t/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim();
  }

  /**
   * Extract job title from JD text
   * @param {string} text - JD text
   * @returns {string} Job title
   */
  extractJobTitle(text) {
    const lines = text.split('\n').filter(line => line.trim().length > 0);

    // Look for common job title patterns
    const titlePatterns = [
      /^([A-Z][^.!?]*?)(?:\s*-|\s*\|)/i,  // "Senior Software Engineer - Full Time"
      /^Job Title:\s*(.+)$/im,
      /^Position:\s*(.+)$/im,
      /^Role:\s*(.+)$/im
    ];

    for (const pattern of titlePatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // Fallback: First non-empty line that's not too long
    for (const line of lines.slice(0, 3)) {
      if (line.length > 5 && line.length < 100 && !line.toLowerCase().includes('company')) {
        return line.trim();
      }
    }

    return null;
  }

  /**
   * Extract company name from JD text
   * @param {string} text - JD text
   * @returns {string} Company name
   */
  extractCompanyName(text) {
    const patterns = [
      /Company:\s*([^\n]+)/i,
      /Organization:\s*([^\n]+)/i,
      /About\s+([^\n]+)/i,
      /([A-Z][a-zA-Z\s&]+(?:Ltd|Inc|Corp|LLC|Pvt|Private|Limited|Corporation))/g
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Extract department from JD text
   * @param {string} text - JD text
   * @returns {string} Department
   */
  extractDepartment(text) {
    const patterns = [
      /Department:\s*([^\n]+)/i,
      /Team:\s*([^\n]+)/i,
      /(Engineering|Marketing|Sales|HR|Finance|Operations|Product|Design|QA|DevOps|Data|Analytics)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Extract location from JD text
   * @param {string} text - JD text
   * @returns {string} Location
   */
  extractLocation(text) {
    const patterns = [
      /Location:\s*([^\n]+)/i,
      /Job Location:\s*([^\n]+)/i,
      /(?:Mumbai|Delhi|Bangalore|Chennai|Pune|Hyderabad|Kolkata|Ahmedabad|Jaipur|Surat|Bengaluru|Noida|Gurgaon|Pune|Chandigarh)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Extract employment type
   * @param {string} text - JD text
   * @returns {string} Employment type
   */
  extractEmploymentType(text) {
    const patterns = [
      /(full.time|part.time|contract|freelance|internship|intern)/i,
      /Employment Type:\s*([^\n]+)/i,
      /Job Type:\s*([^\n]+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const type = match[1].toLowerCase().trim();
        if (type.includes('full')) return 'full-time';
        if (type.includes('part')) return 'part-time';
        if (type.includes('contract')) return 'contract';
        if (type.includes('freelance')) return 'freelance';
        if (type.includes('intern')) return 'intern';
      }
    }

    return 'full-time'; // default
  }

  /**
   * Extract experience requirements
   * @param {string} text - JD text
   * @returns {Object} Experience requirements
   */
  extractExperienceRequirements(text) {
    const patterns = [
      /(\d+)(?:-|\s*to\s*)(\d+)\s*(?:years?|yrs?)/i,
      /(\d+)\s*(?:years?|yrs?)\s*(?:to|-)\s*(\d+)\s*(?:years?|yrs?)/i,
      /(\d+)\+\s*(?:years?|yrs?)/i,
      /(?:experience|exp):\s*(\d+)(?:-|\s*to\s*)(\d+)\s*(?:years?|yrs?)/i,
      /(?:experience|exp):\s*(\d+)\+\s*(?:years?|yrs?)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        if (match[2]) {
          // Range: "3-5 years" or "3 to 5 years"
          return {
            minYears: parseInt(match[1]),
            maxYears: parseInt(match[2])
          };
        } else {
          // Minimum: "3+ years"
          return {
            minYears: parseInt(match[1]),
            maxYears: null
          };
        }
      }
    }

    // Look for phrases like "3 years experience required"
    const expPattern = /(\d+)\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)/i;
    const match = text.match(expPattern);
    if (match) {
      return {
        minYears: parseInt(match[1]),
        maxYears: null
      };
    }

    return { minYears: 0, maxYears: null };
  }

  /**
   * Extract required skills
   * @param {string} text - JD text
   * @returns {Array} Required skills
   */
  extractRequiredSkills(text) {
    const skills = [];
    const skillKeywords = [
      'javascript', 'python', 'java', 'c\\+\\+', 'c#', 'php', 'ruby', 'go', 'rust',
      'react', 'angular', 'vue', 'node', 'express', 'django', 'flask', 'spring',
      'html', 'css', 'sass', 'less', 'bootstrap', 'tailwind',
      'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch',
      'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jenkins', 'git',
      'machine learning', 'ai', 'data science', 'nlp', 'computer vision',
      'agile', 'scrum', 'kanban', 'leadership', 'management'
    ];

    const skillPattern = new RegExp(`\\b(${skillKeywords.join('|')})\\b`, 'gi');

    let match;
    while ((match = skillPattern.exec(text)) !== null) {
      const skill = match[1].toLowerCase();
      if (!skills.includes(skill)) {
        skills.push(skill);
      }
    }

    // Look for "Required Skills" or "Must have" sections
    const requiredSection = text.match(/(?:required skills?|must have|essential skills?|key skills?|technical skills?)[\s\S]*?(?=\n\n|\n[A-Z]|$)/i);
    if (requiredSection) {
      const additionalSkills = this.extractSkillsFromSection(requiredSection[0]);
      skills.push(...additionalSkills);
    }

    // Also look for skills mentioned in responsibilities or general text
    const generalSkills = this.extractSkillsFromGeneralText(text);
    skills.push(...generalSkills);

    return [...new Set(skills)]; // Remove duplicates
  }

  /**
   * Extract preferred skills
   * @param {string} text - JD text
   * @returns {Array} Preferred skills
   */
  extractPreferredSkills(text) {
    const skills = [];

    // Look for "Preferred Skills" or "Nice to have" sections
    const preferredSection = text.match(/(?:preferred skills?|nice to have|good to have)[\s\S]*?(?=\n\n|\n[A-Z]|$)/i);
    if (preferredSection) {
      const additionalSkills = this.extractSkillsFromSection(preferredSection[0]);
      skills.push(...additionalSkills);
    }

    return [...new Set(skills)]; // Remove duplicates
  }

  /**
   * Extract skills from a specific section
   * @param {string} section - Text section
   * @returns {Array} Skills found in section
   */
  extractSkillsFromSection(section) {
    const skills = [];
    const lines = section.split('\n');

    for (const line of lines) {
      // Look for bullet points or comma-separated skills
      const skillMatches = line.match(/[•\-\*]\s*([^,\n]+)/g);
      if (skillMatches) {
        skillMatches.forEach(match => {
          const skill = match.replace(/^[•\-\*]\s*/, '').trim().toLowerCase();
          if (skill.length > 1 && skill.length < 50) {
            skills.push(skill);
          }
        });
      }
    }

    return skills;
  }

  /**
   * Extract skills from general text content
   * @param {string} text - Full text content
   * @returns {Array} Skills found in general text
   */
  extractSkillsFromGeneralText(text) {
    const skills = [];
    const lines = text.split('\n');

    // Look for lines that contain multiple skills or skill-like words
    for (const line of lines) {
      const trimmedLine = line.trim().toLowerCase();

      // Skip lines that are clearly not skill lists
      if (trimmedLine.includes('company') ||
          trimmedLine.includes('location') ||
          trimmedLine.includes('salary') ||
          trimmedLine.includes('experience') ||
          trimmedLine.includes('responsibilities') ||
          trimmedLine.length < 10) {
        continue;
      }

      // Look for comma-separated skills
      if (trimmedLine.includes(',') && trimmedLine.split(',').length > 2) {
        const potentialSkills = trimmedLine.split(',').map(s => s.trim());
        for (const skill of potentialSkills) {
          if (skill.length > 2 && skill.length < 30 && !skill.includes(' and ')) {
            skills.push(skill);
          }
        }
      }

      // Look for skill mentions in sentences
      const skillKeywords = ['javascript', 'python', 'java', 'react', 'node', 'sql', 'aws', 'git'];
      for (const keyword of skillKeywords) {
        if (trimmedLine.includes(keyword) && !skills.includes(keyword)) {
          skills.push(keyword);
        }
      }
    }

    return skills;
  }

  /**
   * Extract technologies (similar to skills but more specific)
   * @param {string} text - JD text
   * @returns {Array} Technologies
   */
  extractTechnologies(text) {
    // Technologies are often more specific than skills
    const techKeywords = [
      'react.js', 'vue.js', 'angular.js', 'node.js', 'express.js', 'django', 'flask',
      'tensorflow', 'pytorch', 'scikit-learn', 'pandas', 'numpy',
      'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch',
      'docker', 'kubernetes', 'jenkins', 'circleci', 'github actions'
    ];

    const techPattern = new RegExp(`\\b(${techKeywords.join('|')})\\b`, 'gi');
    const technologies = [];

    let match;
    while ((match = techPattern.exec(text)) !== null) {
      const tech = match[1].toLowerCase();
      if (!technologies.includes(tech)) {
        technologies.push(tech);
      }
    }

    return technologies;
  }

  /**
   * Extract education requirements
   * @param {string} text - JD text
   * @returns {Array} Education requirements
   */
  extractEducationRequirements(text) {
    const education = [];
    const degreePatterns = [
      /(bachelor|master|phd|doctorate|diploma|b\.tech|m\.tech|b\.e|m\.e|b\.sc|m\.sc|mba|mca|bca|mca)/gi,
      /(computer science|engineering|information technology|business administration)/gi
    ];

    const educationSection = text.match(/(?:education|qualification|degree)[\s\S]*?(?=\n\n|\n[A-Z]|$)/i);
    if (educationSection) {
      degreePatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(educationSection[0])) !== null) {
          education.push(match[1]);
        }
      });
    }

    return [...new Set(education)]; // Remove duplicates
  }

  /**
   * Extract salary range
   * @param {string} text - JD text
   * @returns {Object} Salary range
   */
  extractSalaryRange(text) {
    const salaryPatterns = [
      /(?:salary|compensation|pay|ctc)[\s\S]*?(\d+(?:,\d+)*)(?:\s*-\s*)(\d+(?:,\d+)*)/i,
      /₹?\s*(\d+(?:,\d+)*)\s*(?:to|-)\s*₹?\s*(\d+(?:,\d+)*)/i,
      /\$?\s*(\d+(?:,\d+)*)\s*(?:to|-)\s*\$?\s*(\d+(?:,\d+)*)/i
    ];

    for (const pattern of salaryPatterns) {
      const match = text.match(pattern);
      if (match) {
        const min = parseInt(match[1].replace(/,/g, ''));
        const max = parseInt(match[2].replace(/,/g, ''));
        return { min, max, currency: 'INR' };
      }
    }

    return null;
  }

  /**
   * Extract job location (detailed)
   * @param {string} text - JD text
   * @returns {string} Job location
   */
  extractJobLocation(text) {
    return this.extractLocation(text);
  }

  /**
   * Extract remote work policy
   * @param {string} text - JD text
   * @returns {string} Remote work policy
   */
  extractRemoteWorkPolicy(text) {
    if (text.toLowerCase().includes('remote')) {
      return 'remote';
    } else if (text.toLowerCase().includes('hybrid')) {
      return 'hybrid';
    } else if (text.toLowerCase().includes('flexible')) {
      return 'flexible';
    }
    return 'on-site';
  }

  /**
   * Extract preferred locations
   * @param {string} text - JD text
   * @returns {Array} Preferred locations
   */
  extractPreferredLocations(text) {
    const locations = [];
    const locationKeywords = [
      'mumbai', 'delhi', 'bangalore', 'chennai', 'pune', 'hyderabad', 'kolkata',
      'ahmedabad', 'jaipur', 'surat', 'bengaluru', 'noida', 'gurgaon', 'chandigarh'
    ];

    const locationPattern = new RegExp(`\\b(${locationKeywords.join('|')})\\b`, 'gi');

    let match;
    while ((match = locationPattern.exec(text)) !== null) {
      const location = match[1].toLowerCase();
      if (!locations.includes(location)) {
        locations.push(location);
      }
    }

    return locations;
  }

  /**
   * Extract job responsibilities
   * @param {string} text - JD text
   * @returns {Array} Responsibilities
   */
  extractResponsibilities(text) {
    const responsibilities = [];
    const respSection = text.match(/(?:responsibilities|duties|role|job description)[\s\S]*?(?=\n\n[A-Z]|\n[A-Z]|$)/i);

    if (respSection) {
      const lines = respSection[0].split('\n');
      for (const line of lines) {
        if (line.match(/^[•\-\*]\s/) || line.match(/^\d+\./)) {
          const responsibility = line.replace(/^[•\-\*\d+\.]\s*/, '').trim();
          if (responsibility.length > 10) {
            responsibilities.push(responsibility);
          }
        }
      }
    }

    return responsibilities;
  }

  /**
   * Extract certifications
   * @param {string} text - JD text
   * @returns {Array} Certifications
   */
  extractCertifications(text) {
    const certifications = [];
    const certPatterns = [
      /(?:certification|certificate)[\s\S]*?([A-Z][a-zA-Z\s]+(?:certification|certificate))/gi,
      /(?:aws|azure|gcp|google cloud|microsoft|oracle|cissp|cisa|cism|pmp)/gi
    ];

    try {
      certPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          if (match[1]) {
            certifications.push(match[1].trim());
          }
        }
      });
    } catch (error) {
      console.warn('Error extracting certifications:', error.message);
    }

    return [...new Set(certifications)];
  }

  /**
   * Extract languages
   * @param {string} text - JD text
   * @returns {Array} Languages
   */
  extractLanguages(text) {
    const languages = [];
    const languageKeywords = [
      'english', 'hindi', 'spanish', 'french', 'german', 'chinese', 'japanese',
      'korean', 'arabic', 'portuguese', 'italian', 'russian'
    ];

    const languagePattern = new RegExp(`\\b(${languageKeywords.join('|')})\\b`, 'gi');

    let match;
    while ((match = languagePattern.exec(text)) !== null) {
      const language = match[1].toLowerCase();
      if (!languages.includes(language)) {
        languages.push(language);
      }
    }

    return languages;
  }

  /**
   * Extract notice period
   * @param {string} text - JD text
   * @returns {Object} Notice period
   */
  extractNoticePeriod(text) {
    const noticePattern = /(?:notice period|joining time)[\s\S]*?(\d+)\s*(?:months?|days?|weeks?)/i;
    const match = text.match(noticePattern);

    if (match) {
      return {
        preferred: `${match[1]} ${match[2]}`,
        flexible: text.toLowerCase().includes('flexible')
      };
    }

    return null;
  }

  /**
   * Extract benefits
   * @param {string} text - JD text
   * @returns {Array} Benefits
   */
  extractBenefits(text) {
    const benefits = [];
    const benefitKeywords = [
      'health insurance', 'dental', 'vision', 'retirement', '401k', 'pension',
      'vacation', 'pto', 'sick leave', 'maternity', 'paternity', 'bonus',
      'stock options', 'flexible hours', 'remote work', 'gym', 'meal', 'transport'
    ];

    const benefitPattern = new RegExp(`\\b(${benefitKeywords.join('|')})\\b`, 'gi');

    let match;
    while ((match = benefitPattern.exec(text)) !== null) {
      const benefit = match[1].toLowerCase();
      if (!benefits.includes(benefit)) {
        benefits.push(benefit);
      }
    }

    return benefits;
  }

  /**
   * Extract perks
   * @param {string} text - JD text
   * @returns {Array} Perks
   */
  extractPerks(text) {
    // Perks are similar to benefits but more lifestyle-oriented
    const perks = [];
    const perkKeywords = [
      'free lunch', 'snacks', 'coffee', 'gym membership', 'learning budget',
      'conference budget', 'home office', 'latest laptop', 'unlimited pto',
      'work from home', 'flexible schedule', 'team outings', 'game room'
    ];

    const perkPattern = new RegExp(`\\b(${perkKeywords.join('|')})\\b`, 'gi');

    let match;
    while ((match = perkPattern.exec(text)) !== null) {
      const perk = match[1].toLowerCase();
      if (!perks.includes(perk)) {
        perks.push(perk);
      }
    }

    return perks;
  }

  /**
   * Get MIME type for file extension
   * @param {string} ext - File extension
   * @returns {string} MIME type
   */
  getMimeType(ext) {
    const mimeTypes = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Process JD parsing queue
   * @param {Object} jobData - Job data to process
   * @returns {Promise<Object>} Processing result
   */
  async processQueue(jobData) {
    if (this.activeProcesses >= this.maxConcurrent) {
      this.processingQueue.push(jobData);
      console.log(`⏸️  JD parsing queued. Active: ${this.activeProcesses}, Queue: ${this.processingQueue.length}`);
      return { queued: true };
    }

    this.activeProcesses++;
    console.log(`🚀 Starting JD parsing for job ID: ${jobData.jobId}`);
    console.log(`📁 File path: ${jobData.filePath}`);
    console.log(`📊 Active processes: ${this.activeProcesses}/${this.maxConcurrent}`);
    
    const startTime = Date.now();
    try {
      const result = await this.parseJD(jobData.filePath, jobData.options);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`⏱️  Parsing took ${duration} seconds`);

      // Update database if jobId provided
      if (jobData.jobId && result.success) {
        const JobDescription = getTenantModel(jobData.tenantConnection, 'JobDescription');
        const updatedJD = await JobDescription.findByIdAndUpdate(
          jobData.jobId, 
          {
            parsedData: result.data,
            parsingStatus: 'completed',
            parsingMetadata: result.metadata,
            rawText: result.metadata.extractedText,
            lastProcessedAt: new Date()
          },
          { new: true }
        );
        
        console.log(`✅ JD parsing completed for: ${updatedJD.jobTitle} (ID: ${jobData.jobId})`);
        console.log(`📊 Extracted data: ${result.data.requiredSkills?.length || 0} required skills, ${result.data.experienceRequired?.minYears || 0}-${result.data.experienceRequired?.maxYears || 'N/A'} years experience`);
      }

      return result;
    } catch (error) {
      console.error('❌ JD parsing error:', error);
      console.error('Error stack:', error.stack);

      // Update database with error if jobId provided
      if (jobData.jobId) {
        try {
          const JobDescription = getTenantModel(jobData.tenantConnection, 'JobDescription');
          await JobDescription.findByIdAndUpdate(jobData.jobId, {
            parsingStatus: 'failed',
            parsingError: error.message,
            lastProcessedAt: new Date()
          });
          console.log(`💾 Updated job ${jobData.jobId} status to failed`);
        } catch (dbError) {
          console.error('❌ Failed to update job status in DB:', dbError);
        }
      }

      return { success: false, error: error.message };
    } finally {
      this.activeProcesses--;

      // Process next item in queue
      if (this.processingQueue.length > 0) {
        const nextJob = this.processingQueue.shift();
        setImmediate(() => this.processQueue(nextJob));
      }
    }
  }

  /**
   * Get service health status
   * @returns {Object} Health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      activeProcesses: this.activeProcesses,
      queueLength: this.processingQueue.length,
      maxConcurrent: this.maxConcurrent,
      supportedFormats: this.supportedFormats
    };
  }
}

module.exports = new JDParserService();