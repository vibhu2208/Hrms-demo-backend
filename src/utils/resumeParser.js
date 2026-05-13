const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

/**
 * Resume Parser Utility
 * Extracts text and structured data from PDF and DOCX resumes
 */
class ResumeParser {
  constructor() {
    this.pdfParse = null;
    this.mammoth = null;
    this.initialized = false;
  }

  /**
   * Lazy load dependencies
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Try to load pdf-parse
      this.pdfParse = require('pdf-parse');
    } catch (error) {
      console.warn('pdf-parse not installed. PDF parsing will be limited.');
    }
    
    try {
      // Try to load mammoth for DOCX
      this.mammoth = require('mammoth');
    } catch (error) {
      console.warn('mammoth not installed. DOCX parsing will be limited.');
    }
    
    this.initialized = true;
  }

  /**
   * Parse PDF resume
   */
  async parsePDF(filePath) {
    await this.initialize();
    
    if (!this.pdfParse) {
      throw new Error('PDF parsing not available. Install pdf-parse package.');
    }

    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await this.pdfParse(dataBuffer);
      return data.text;
    } catch (error) {
      console.error('Error parsing PDF:', error);
      throw new Error('Failed to parse PDF resume');
    }
  }

  /**
   * Parse DOCX resume
   */
  async parseDOCX(filePath) {
    await this.initialize();
    
    if (!this.mammoth) {
      throw new Error('DOCX parsing not available. Install mammoth package.');
    }

    try {
      const result = await this.mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (error) {
      console.error('Error parsing DOCX:', error);
      throw new Error('Failed to parse DOCX resume');
    }
  }

  /**
   * Parse resume from URL
   */
  async parseFromURL(url) {
    try {
      const extension = path.extname(url).toLowerCase();
      
      // Download file to temp location
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      const tempDir = path.join(__dirname, '../../temp');
      
      // Create temp directory if it doesn't exist
      try {
        await fs.mkdir(tempDir, { recursive: true });
      } catch (error) {
        // Directory might already exist
      }
      
      const tempFile = path.join(tempDir, `resume_${Date.now()}${extension}`);
      await fs.writeFile(tempFile, response.data);
      
      let text = '';
      
      if (extension === '.pdf') {
        text = await this.parsePDF(tempFile);
      } else if (extension === '.docx' || extension === '.doc') {
        text = await this.parseDOCX(tempFile);
      } else {
        throw new Error('Unsupported file format. Only PDF and DOCX are supported.');
      }
      
      // Clean up temp file
      try {
        await fs.unlink(tempFile);
      } catch (error) {
        console.warn('Failed to delete temp file:', error);
      }
      
      return text;
    } catch (error) {
      console.error('Error parsing resume from URL:', error);
      throw error;
    }
  }

  /**
   * Extract skills from resume text
   */
  extractSkills(text) {
    const commonSkills = [
      // Programming Languages
      'javascript', 'python', 'java', 'c++', 'c#', 'ruby', 'php', 'swift', 'kotlin', 'go', 'rust', 'typescript',
      // Web Technologies
      'html', 'css', 'react', 'angular', 'vue', 'node.js', 'express', 'django', 'flask', 'spring', 'asp.net',
      // Databases
      'mysql', 'postgresql', 'mongodb', 'redis', 'oracle', 'sql server', 'dynamodb', 'cassandra',
      // Cloud & DevOps
      'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jenkins', 'ci/cd', 'terraform', 'ansible',
      // Mobile
      'android', 'ios', 'react native', 'flutter', 'xamarin',
      // Data Science & AI
      'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'scikit-learn', 'pandas', 'numpy',
      // Other
      'git', 'agile', 'scrum', 'rest api', 'graphql', 'microservices', 'testing', 'selenium'
    ];
    
    const lowerText = text.toLowerCase();
    const foundSkills = commonSkills.filter(skill => 
      lowerText.includes(skill.toLowerCase())
    );
    
    return [...new Set(foundSkills)]; // Remove duplicates
  }

  /**
   * Extract experience in years
   */
  extractExperience(text) {
    const patterns = [
      /(\d+)\+?\s*years?\s+(?:of\s+)?experience/i,
      /experience[:\s]+(\d+)\+?\s*years?/i,
      /(\d+)\+?\s*years?\s+in/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return parseInt(match[1]);
      }
    }
    
    return null;
  }

  /**
   * Extract education details
   */
  extractEducation(text) {
    const degrees = [
      'phd', 'ph.d', 'doctorate',
      'master', 'mba', 'ms', 'm.s', 'm.tech', 'mca',
      'bachelor', 'b.tech', 'b.e', 'bca', 'bsc', 'b.sc', 'ba', 'b.a',
      'diploma'
    ];
    
    const education = [];
    const lowerText = text.toLowerCase();
    
    for (const degree of degrees) {
      if (lowerText.includes(degree)) {
        // Try to extract the full education line
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.toLowerCase().includes(degree)) {
            education.push(line.trim());
            break;
          }
        }
      }
    }
    
    return [...new Set(education)]; // Remove duplicates
  }

  /**
   * Extract email addresses
   */
  extractEmails(text) {
    const emailPattern = /[\w.-]+@[\w.-]+\.\w+/g;
    const emails = text.match(emailPattern) || [];
    return [...new Set(emails)];
  }

  /**
   * Extract phone numbers
   */
  extractPhones(text) {
    const phonePatterns = [
      /\+?\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      /\d{10}/g
    ];
    
    const phones = [];
    for (const pattern of phonePatterns) {
      const matches = text.match(pattern) || [];
      phones.push(...matches);
    }
    
    return [...new Set(phones)];
  }

  /**
   * Parse and extract structured data from resume
   */
  async parseResume(resumeUrl) {
    try {
      const text = await this.parseFromURL(resumeUrl);
      
      return {
        rawText: text,
        skills: this.extractSkills(text),
        experience: this.extractExperience(text),
        education: this.extractEducation(text),
        emails: this.extractEmails(text),
        phones: this.extractPhones(text)
      };
    } catch (error) {
      console.error('Error parsing resume:', error);
      return {
        rawText: '',
        skills: [],
        experience: null,
        education: [],
        emails: [],
        phones: [],
        error: error.message
      };
    }
  }

  /**
   * Enhance candidate data with resume insights
   */
  async enhanceCandidateWithResume(candidate) {
    if (!candidate.resume || !candidate.resume.url) {
      return candidate;
    }

    try {
      const resumeData = await this.parseResume(candidate.resume.url);
      
      // Merge extracted skills with existing skills
      if (resumeData.skills && resumeData.skills.length > 0) {
        const existingSkills = candidate.skills || [];
        candidate.skills = [...new Set([...existingSkills, ...resumeData.skills])];
      }
      
      // Update experience if extracted and not present
      if (resumeData.experience && !candidate.experience?.years) {
        candidate.experience = {
          years: resumeData.experience,
          months: 0
        };
      }
      
      // Store raw resume text for AI analysis
      candidate.resumeText = resumeData.rawText;
      
      return candidate;
    } catch (error) {
      console.error('Error enhancing candidate with resume:', error);
      return candidate;
    }
  }
}

module.exports = new ResumeParser();
