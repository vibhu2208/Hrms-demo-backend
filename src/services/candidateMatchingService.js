const { getTenantModel } = require('../utils/tenantModels');
const natural = require('natural');

class CandidateMatchingService {
  constructor() {
    this.skillWeights = {
      exact: 1.0,
      partial: 0.7,
      related: 0.4
    };

    this.matchWeights = {
      skills: 0.45,      // Increased - skills are most important
      experience: 0.25,  // Kept same - experience is crucial
      location: 0.15,    // Kept same - location flexibility varies
      education: 0.1,    // Kept same - education is baseline
      salary: 0.05       // Kept same - salary is least important for matching
    };

    this.similarityThreshold = 0.6; // Minimum similarity for partial matches

    // Skill normalization mappings
    this.skillMappings = {
      'javascript': ['javascript', 'js', 'java script'],
      'typescript': ['typescript', 'ts'],
      'python': ['python', 'py'],
      'java': ['java'],
      'csharp': ['c#', 'csharp', 'c sharp'],
      'cpp': ['c++', 'cpp', 'c plus plus'],
      'react': ['react', 'react.js', 'reactjs'],
      'angular': ['angular', 'angular.js', 'angularjs'],
      'vue': ['vue', 'vue.js', 'vuejs'],
      'nodejs': ['node.js', 'nodejs', 'node'],
      'express': ['express', 'express.js'],
      'mongodb': ['mongodb', 'mongo'],
      'postgresql': ['postgresql', 'postgres', 'psql'],
      'mysql': ['mysql'],
      'aws': ['aws', 'amazon web services'],
      'docker': ['docker'],
      'kubernetes': ['kubernetes', 'k8s'],
      'git': ['git'],
      'agile': ['agile', 'scrum', 'kanban']
    };
  }

  /**
   * Normalize skill name for consistent matching
   * @param {string} skill - Skill name to normalize
   * @returns {string} Normalized skill name
   */
  normalizeSkill(skill) {
    if (!skill) return '';

    // Remove common suffixes and normalize
    let normalized = skill.toLowerCase().trim()
      .replace(/\.(js|ts|jsx|tsx)$/g, '') // Remove file extensions
      .replace(/[^a-z0-9\s]/g, ' ') // Replace special chars with space
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();

    // Split into words and process each
    const words = normalized.split(' ');
    const processedWords = words.map(word => {
      // Handle common abbreviations
      const abbreviations = {
        'javascript': ['js', 'java script'],
        'typescript': ['ts'],
        'python': ['py'],
        'csharp': ['c#', 'csharp', 'c sharp'],
        'cplusplus': ['c++', 'cpp', 'c plus plus'],
        'dotnet': ['.net', 'dot net'],
        'nodejs': ['node.js', 'node', 'nodejs'],
        'react': ['reactjs', 'react.js'],
        'angular': ['angularjs', 'angular.js'],
        'vue': ['vuejs', 'vue.js'],
        'mongodb': ['mongo', 'mongo db'],
        'postgresql': ['postgres', 'psql', 'postgre sql'],
        'mysql': ['my sql'],
        'html': ['hypertext markup language'],
        'css': ['cascading style sheets'],
        'aws': ['amazon web services'],
        'gcp': ['google cloud platform'],
        'azure': ['microsoft azure'],
        'git': ['version control'],
        'docker': ['containerization'],
        'kubernetes': ['k8s', 'kuber netes'],
        'jenkins': ['ci cd', 'continuous integration'],
        'agile': ['scrum', 'kanban', 'methodology'],
        'rest': ['restful', 'rest api'],
        'api': ['application programming interface'],
        'ui': ['user interface'],
        'ux': ['user experience'],
        'frontend': ['front end', 'client side'],
        'backend': ['back end', 'server side'],
        'fullstack': ['full stack', 'mean', 'mern'],
        'devops': ['development operations']
      };

      // Check if word matches any abbreviation
      for (const [canonical, variations] of Object.entries(abbreviations)) {
        if (variations.includes(word)) {
          return canonical;
        }
      }

      return word;
    });

    normalized = processedWords.join(' ');

    // Check comprehensive skill mappings
    for (const [canonical, variations] of Object.entries(this.skillMappings)) {
      for (const variation of variations) {
        if (normalized.includes(variation) || variation.includes(normalized)) {
          return canonical;
        }
      }
    }

    return normalized;
  }

  /**
   * Match candidates against a job description
   * @param {Object} jobDescription - JobDescription document
   * @param {Object} tenantConnection - Tenant database connection
   * @param {Object} options - Matching options
   * @returns {Promise<Array>} Array of matched candidates with scores
   */
  async matchCandidates(jobDescription, tenantConnection, options = {}) {
    const Candidate = getTenantModel(tenantConnection, 'Candidate');

    // Get all active candidates
    const candidates = await Candidate.find({
      status: { $in: ['active', 'applied'] },
      isActive: true
    }).select('+resume');

    const matches = [];

    for (const candidate of candidates) {
      const matchResult = await this.calculateMatchScore(candidate, jobDescription, options);
      if (matchResult.overallScore >= (options.minScore || 0)) {
        // Generate human-readable explanation
        const explanation = this.generateRelevanceExplanation(matchResult);

        // Simplify matched skills for response - just return skill names
        const simpleMatchedSkills = explanation.matchedSkills.map(skill =>
          skill.jdSkill || skill.candidateSkill
        );

        matches.push({
          candidateId: candidate._id,
          overallScore: matchResult.overallScore,
          matchedSkills: simpleMatchedSkills, // Simple skill names only
          matchedSkillsCount: explanation.matchedSkillsCount,
          relevanceExplanation: explanation.relevanceExplanation,
          experienceMatch: matchResult.experienceMatch,
          locationMatch: matchResult.locationMatch,
          educationMatch: matchResult.educationMatch,
          overallFit: matchResult.overallFit,
          matchedAt: new Date()
        });
      }
    }

    // Sort by match score (descending)
    matches.sort((a, b) => b.overallScore - a.overallScore);

    // Limit results if specified
    const maxResults = options.maxResults || 50;
    return matches.slice(0, maxResults);
  }

  /**
   * Generate human-readable relevance explanation
   * @param {Object} matchResult - Complete match result
   * @returns {Object} Object with matchedSkills and relevanceExplanation
   */
  generateRelevanceExplanation(matchResult) {
    const { skillMatches, experienceMatch, locationMatch, educationMatch, salaryMatch, overallFit } = matchResult;

    // skillMatches is the result object from calculateSkillMatch with details, requiredMatched, etc.
    const skillDetails = skillMatches.details || [];
    const requiredMatched = skillMatches.requiredMatched || 0;
    const preferredMatched = skillMatches.preferredMatched || 0;
    const technologyMatched = skillMatches.technologyMatched || 0;

    // Extract matched skills with full details
    const matchedSkillsDetails = skillDetails
      .filter(match => match.score > 0)
      .map(match => ({
        jdSkill: match.skill,
        candidateSkill: match.candidateSkill,
        matchType: match.matchType,
        isPreferred: match.isPreferred || false,
        isTechnology: match.isTechnology || false
      }));

    // Build relevance explanation
    const reasons = [];

    // Overall fit
    reasons.push(`Overall fit: ${overallFit}`);

    // Skills match - use the breakdown from skill matching result
    let skillDescription = '';
    if (requiredMatched > 0) {
      skillDescription = `${requiredMatched} required`;
      if (preferredMatched > 0) {
        skillDescription += `, ${preferredMatched} preferred`;
      }
      if (technologyMatched > 0) {
        skillDescription += `, ${technologyMatched} tech`;
      }
      reasons.push(`Skills match: ${skillDescription} skills`);
    } else if (preferredMatched > 0 || technologyMatched > 0) {
      const totalMatched = preferredMatched + technologyMatched;
      reasons.push(`Skills match: ${totalMatched} bonus skills`);
    } else {
      reasons.push('Skills match: 0 skills');
    }

    // Experience match
    if (experienceMatch.matchType) {
      reasons.push(`Experience: ${experienceMatch.matchType}`);
    }

    // Location match
    if (locationMatch.matchType) {
      reasons.push(`Location: ${locationMatch.matchType}`);
    }

    // Education match (if available)
    if (educationMatch.hasRequiredEducation !== undefined) {
      const eduStatus = educationMatch.hasRequiredEducation ? 'matches' : 'no-match';
      reasons.push(`Education: ${eduStatus}`);
    }

    const relevanceExplanation = reasons.join('. ') + '.';

    return {
      matchedSkills: matchedSkillsDetails,
      matchedSkillsCount: {
        required: requiredMatched,
        preferred: preferredMatched,
        technology: technologyMatched,
        total: matchedSkillsDetails.length
      },
      relevanceExplanation: relevanceExplanation
    };
  }

  /**
   * Calculate match score for a single candidate
   * @param {Object} candidate - Candidate document
   * @param {Object} jobDescription - JobDescription document
   * @param {Object} options - Matching options
   * @returns {Object} Match result with scores and details
   */
  async calculateMatchScore(candidate, jobDescription, options = {}) {
    const jdData = jobDescription.parsedData;

    // Calculate individual match components with error handling
    let skillMatch, experienceMatch, locationMatch, educationMatch, salaryMatch;

    try {
      skillMatch = this.calculateSkillMatch(candidate, jdData);
    } catch (error) {
      console.error('Skill matching failed:', error.message);
      skillMatch = { score: 0, details: [], requiredMatched: 0, preferredMatched: 0, technologyMatched: 0, totalMatched: 0 };
    }

    try {
      experienceMatch = this.calculateExperienceMatch(candidate, jdData);
    } catch (error) {
      console.error('Experience matching failed:', error.message);
      experienceMatch = { score: 50, candidateYears: 0, requiredMin: 0, requiredMax: null, matchType: 'error', experienceLevel: 'unknown' };
    }

    try {
      locationMatch = this.calculateLocationMatch(candidate, jdData);
    } catch (error) {
      console.error('Location matching failed:', error.message);
      locationMatch = { score: 50, candidateLocation: '', jobLocation: '', matchType: 'error', matchDetails: {} };
    }

    try {
      educationMatch = this.calculateEducationMatch(candidate, jdData);
    } catch (error) {
      console.error('Education matching failed:', error.message);
      educationMatch = { score: 100, hasRequiredEducation: true, candidateEducation: [], requiredEducation: [], matchType: 'error' };
    }

    try {
      salaryMatch = this.calculateSalaryMatch(candidate, jdData);
    } catch (error) {
      console.error('Salary matching failed:', error.message);
      salaryMatch = { score: 50, candidateCTC: null, jobSalaryRange: null, matchType: 'error' };
    }

    // Calculate weighted overall score with improved logic and NaN protection
    const rawWeightedScore =
      skillMatch.score * this.matchWeights.skills +
      experienceMatch.score * this.matchWeights.experience +
      locationMatch.score * this.matchWeights.location +
      educationMatch.score * this.matchWeights.education +
      salaryMatch.score * this.matchWeights.salary;

    // Ensure we don't have NaN from any failed calculations
    const weightedScore = Math.round(isNaN(rawWeightedScore) ? 0 : rawWeightedScore);

    // Apply minimum thresholds - if critical criteria are too low, reduce overall score
    let overallScore = weightedScore;

    // Critical skill threshold - if skills are below 60%, reduce overall score significantly
    if (skillMatch.score < 60) {
      overallScore = Math.round(overallScore * 0.7); // 30% penalty
    }
    // Experience threshold - if experience is way off, reduce score
    else if (experienceMatch.score < 40) {
      overallScore = Math.round(overallScore * 0.8); // 20% penalty
    }
    // Location penalty - if location doesn't match and no remote work, reduce score
    else if (locationMatch.score < 50 && (!jdData.remoteWork || jdData.remoteWork === 'office')) {
      overallScore = Math.round(overallScore * 0.9); // 10% penalty
    }

    // Ensure score stays within bounds and handle NaN values
    overallScore = isNaN(overallScore) ? 0 : Math.max(0, Math.min(100, overallScore));

    // Determine overall fit category with more nuanced thresholds
    let overallFit = 'poor';
    if (overallScore >= 85) overallFit = 'excellent';
    else if (overallScore >= 70) overallFit = 'good';
    else if (overallScore >= 55) overallFit = 'average';

    return {
      overallScore,
      overallFit,
      skillMatches: {
        details: skillMatch.details,
        requiredMatched: skillMatch.requiredMatched,
        preferredMatched: skillMatch.preferredMatched,
        technologyMatched: skillMatch.technologyMatched,
        totalMatched: skillMatch.totalMatched
      },
      experienceMatch,
      locationMatch,
      educationMatch,
      salaryMatch
    };
  }

  /**
   * Calculate skill matching score
   * @param {Object} candidate - Candidate document
   * @param {Object} jdData - Job description parsed data
   * @returns {Object} Skill match result
   */
  calculateSkillMatch(candidate, jdData) {
    const candidateSkills = (candidate.skills || []).map(s => this.normalizeSkill(s));
    const requiredSkills = [
      ...(jdData.requiredSkills || []).map(s =>
        typeof s === 'string' ? this.normalizeSkill(s) : this.normalizeSkill(s.skill)
      ),
      ...(jdData.requiredSkillsSimple || []).map(s => this.normalizeSkill(s))
    ].filter(s => s && s.length > 0); // Filter out empty/null skills
    const preferredSkills = [
      ...(jdData.preferredSkills || []).map(s =>
        typeof s === 'string' ? this.normalizeSkill(s) : this.normalizeSkill(s.skill)
      ),
      ...(jdData.preferredSkillsSimple || []).map(s => this.normalizeSkill(s))
    ].filter(s => s && s.length > 0);

    const matchedSkills = [];
    let totalScore = 0;
    let maxPossibleScore = requiredSkills.length * 100; // Each required skill worth 100 points


    // Check required skills (higher weight)
    for (const requiredSkill of requiredSkills) {
      const match = this.findBestSkillMatch(requiredSkill, candidateSkills);
      if (match) {
        const score = match.type === 'exact' ? 100 :
                     match.type === 'partial' ? 70 : 40;
        totalScore += score;
        matchedSkills.push({
          skill: requiredSkill,
          candidateSkill: match.candidateSkill,
          matchType: match.type,
          score: score
        });
      }
    }

    // Check preferred skills (lower weight, bonus points)
    for (const preferredSkill of preferredSkills) {
      const match = this.findBestSkillMatch(preferredSkill, candidateSkills);
      if (match && !matchedSkills.find(m => m.skill === preferredSkill)) {
        const score = match.type === 'exact' ? 50 :
                     match.type === 'partial' ? 35 : 20;
        totalScore += score;
        matchedSkills.push({
          skill: preferredSkill,
          candidateSkill: match.candidateSkill,
          matchType: match.type,
          score: score,
          isPreferred: true
        });
      }
    }

    // Add bonus for technologies
    const candidateTech = this.extractTechnologiesFromSkills(candidateSkills);
    const jdTech = jdData.technologies || [];
    for (const tech of jdTech) {
      if (candidateTech.includes(tech.toLowerCase())) {
        totalScore += 30; // Bonus for matching technologies
        matchedSkills.push({
          skill: tech,
          candidateSkill: tech,
          matchType: 'exact',
          score: 30,
          isTechnology: true
        });
      }
    }

    // Calculate percentage score
    const finalScore = maxPossibleScore > 0 ? Math.min((totalScore / maxPossibleScore) * 100, 100) : 0;

    return {
      score: Math.round(finalScore),
      totalMatched: matchedSkills.length,
      requiredMatched: matchedSkills.filter(m => !m.isPreferred && !m.isTechnology).length,
      preferredMatched: matchedSkills.filter(m => m.isPreferred).length,
      technologyMatched: matchedSkills.filter(m => m.isTechnology).length,
      details: matchedSkills
    };
  }

  /**
   * Find best skill match for a required skill with improved matching
   * @param {string} requiredSkill - Required skill name
   * @param {Array} candidateSkills - Candidate's skills
   * @returns {Object|null} Best match result
   */
  findBestSkillMatch(requiredSkill, candidateSkills) {
    let bestMatch = null;
    let bestScore = 0;

    for (const candidateSkill of candidateSkills) {
      let matchType = null;
      let score = 0;

      // 1. Exact match (highest priority)
      if (candidateSkill === requiredSkill) {
        return {
          candidateSkill,
          type: 'exact',
          similarity: 1.0,
          score: 100
        };
      }

      // 2. Synonym match (check if skills are synonyms)
      if (this.areSkillsSynonyms(requiredSkill, candidateSkill)) {
        matchType = 'synonym';
        score = 95;
      }
      // 3. Category match (e.g., React is a frontend framework)
      else if (this.isCategoryMatch(requiredSkill, candidateSkill)) {
        matchType = 'category';
        score = 80;
      }
      // 4. Fuzzy string similarity
      else {
        try {
          const similarity = natural.JaroWinklerDistance(requiredSkill, candidateSkill);
          if (similarity >= this.similarityThreshold) {
            matchType = 'fuzzy';
            score = Math.round(similarity * 70); // Max 70 for fuzzy matches
          }
        } catch (error) {
          console.warn(`Natural library fuzzy matching failed for skills "${requiredSkill}" and "${candidateSkill}":`, error.message);
          // Continue to fallback matching methods below
        }

        // 5. Partial word match (fallback when fuzzy matching fails or doesn't meet threshold)
        if (!matchType && requiredSkill.includes(candidateSkill) || candidateSkill.includes(requiredSkill)) {
          if (requiredSkill.length > 3 && candidateSkill.length > 3) {
            matchType = 'partial';
            score = 40;
          }
        }
        // 6. Technology family match (e.g., Java and Spring are both JVM technologies)
        else if (!matchType && this.isTechnologyFamilyMatch(requiredSkill, candidateSkill)) {
          matchType = 'family';
          score = 30;
        }
      }

      // Update best match if this score is higher
      if (score > bestScore) {
        bestMatch = {
          candidateSkill,
          type: matchType,
          similarity: score / 100,
          score: score
        };
        bestScore = score;
      }
    }

    return bestMatch;
  }

  /**
   * Check if two skills are synonyms
   * @param {string} skill1 - First skill
   * @param {string} skill2 - Second skill
   * @returns {boolean} Whether skills are synonyms
   */
  areSkillsSynonyms(skill1, skill2) {
    const synonymGroups = [
      ['javascript', 'js', 'ecmascript'],
      ['typescript', 'ts'],
      ['python', 'py'],
      ['java', 'java programming'],
      ['csharp', 'c#', 'csharp'],
      ['cplusplus', 'c++', 'cpp'],
      ['react', 'reactjs', 'react.js'],
      ['angular', 'angularjs'],
      ['vue', 'vuejs'],
      ['nodejs', 'node', 'node.js'],
      ['mongodb', 'mongo'],
      ['postgresql', 'postgres'],
      ['mysql', 'my sql'],
      ['html', 'hypertext markup language'],
      ['css', 'cascading style sheets'],
      ['aws', 'amazon web services'],
      ['docker', 'containerization'],
      ['kubernetes', 'k8s'],
      ['git', 'version control'],
      ['rest', 'restful', 'rest api'],
      ['api', 'application programming interface']
    ];

    for (const group of synonymGroups) {
      if (group.includes(skill1) && group.includes(skill2)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if skills belong to the same category
   * @param {string} skill1 - First skill
   * @param {string} skill2 - Second skill
   * @returns {boolean} Whether skills are in same category
   */
  isCategoryMatch(skill1, skill2) {
    const categories = {
      frontend: ['react', 'angular', 'vue', 'javascript', 'typescript', 'html', 'css', 'sass', 'bootstrap', 'tailwind'],
      backend: ['nodejs', 'python', 'java', 'csharp', 'php', 'ruby', 'go', 'spring', 'django', 'flask', 'express'],
      database: ['mongodb', 'postgresql', 'mysql', 'redis', 'elasticsearch', 'oracle', 'sql server'],
      cloud: ['aws', 'azure', 'gcp', 'heroku', 'digitalocean', 'docker', 'kubernetes'],
      tools: ['git', 'jenkins', 'webpack', 'babel', 'eslint', 'prettier', 'npm', 'yarn'],
      testing: ['jest', 'mocha', 'cypress', 'selenium', 'junit', 'testng'],
      mobile: ['react native', 'flutter', 'ionic', 'swift', 'kotlin', 'android', 'ios']
    };

    for (const [category, skills] of Object.entries(categories)) {
      if (skills.includes(skill1) && skills.includes(skill2)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if skills belong to the same technology family
   * @param {string} skill1 - First skill
   * @param {string} skill2 - Second skill
   * @returns {boolean} Whether skills are in same technology family
   */
  isTechnologyFamilyMatch(skill1, skill2) {
    const families = {
      jvm: ['java', 'kotlin', 'scala', 'groovy', 'spring', 'hibernate', 'maven', 'gradle'],
      microsoft: ['csharp', 'dotnet', 'asp.net', 'sql server', 'azure'],
      javascript: ['javascript', 'typescript', 'nodejs', 'react', 'angular', 'vue', 'express'],
      python: ['python', 'django', 'flask', 'fastapi', 'pandas', 'numpy', 'tensorflow'],
      mobile: ['android', 'ios', 'swift', 'kotlin', 'react native', 'flutter']
    };

    for (const [family, skills] of Object.entries(families)) {
      if (skills.includes(skill1) && skills.includes(skill2)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extract technologies from skills array
   * @param {Array} skills - Skills array
   * @returns {Array} Technologies found
   */
  extractTechnologiesFromSkills(skills) {
    const technologies = [
      'javascript', 'python', 'java', 'c++', 'c#', 'php', 'ruby', 'go', 'rust',
      'react', 'angular', 'vue', 'node', 'express', 'django', 'flask', 'spring',
      'html', 'css', 'sass', 'bootstrap', 'tailwind',
      'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch',
      'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jenkins'
    ];

    return skills.filter(skill =>
      technologies.some(tech => skill.includes(tech) || tech.includes(skill))
    );
  }

  /**
   * Calculate experience matching score with improved flexibility
   * @param {Object} candidate - Candidate document
   * @param {Object} jdData - Job description parsed data
   * @returns {Object} Experience match result
   */
  calculateExperienceMatch(candidate, jdData) {
    const candidateExp = candidate.experience?.years || 0;
    const requiredMin = jdData.experienceRequired?.minYears || 0;
    const requiredMax = jdData.experienceRequired?.maxYears;

    let score = 0;
    let matchType = 'no-match';
    let experienceLevel = this.getExperienceLevel(candidateExp);

    // If no experience requirements specified, give neutral score
    if (requiredMin === 0 && !requiredMax) {
      return {
        score: 50,
        candidateYears: candidateExp,
        requiredMin: requiredMin,
        requiredMax: requiredMax,
        matchType: 'no-requirement',
        experienceLevel: experienceLevel
      };
    }

    // Perfect match - within specified range
    if (candidateExp >= requiredMin && (!requiredMax || candidateExp <= requiredMax)) {
      score = 100;
      matchType = 'perfect';
    }
    // Excellent match - slightly outside range but very close
    else if (candidateExp >= requiredMin * 0.9 && candidateExp <= (requiredMax || requiredMin * 2) * 1.1) {
      score = 90;
      matchType = 'excellent';
    }
    // Good match - reasonable experience for the role
    else if (candidateExp >= requiredMin * 0.8 && candidateExp <= (requiredMax || requiredMin * 2) * 1.3) {
      score = 75;
      matchType = 'good';
    }
    // Acceptable match - could work with some training
    else if (candidateExp >= requiredMin * 0.6 && candidateExp <= (requiredMax || requiredMin * 3) * 1.5) {
      score = 60;
      matchType = 'acceptable';
    }
    // Over-qualified - too much experience
    else if (candidateExp > (requiredMax || requiredMin * 2)) {
      const overBy = candidateExp / (requiredMax || requiredMin * 2);
      score = Math.max(30, 100 - (overBy - 1) * 40); // Penalty for being over-qualified
      matchType = 'over-qualified';
    }
    // Under-qualified - too little experience
    else if (candidateExp < requiredMin * 0.6) {
      const underBy = candidateExp / requiredMin;
      score = Math.max(20, underBy * 80); // Partial score based on experience ratio
      matchType = 'under-qualified';
    }
    // Close match - just outside bounds but could work
    else {
      score = 65;
      matchType = 'close';
    }

    return {
      score: Math.round(Math.max(0, Math.min(100, score))),
      candidateYears: candidateExp,
      requiredMin: requiredMin,
      requiredMax: requiredMax,
      matchType: matchType,
      experienceLevel: experienceLevel
    };
  }

  /**
   * Get experience level based on years
   * @param {number} years - Years of experience
   * @returns {string} Experience level
   */
  getExperienceLevel(years) {
    if (years < 1) return 'entry';
    if (years < 3) return 'junior';
    if (years < 5) return 'mid';
    if (years < 8) return 'senior';
    if (years < 12) return 'lead';
    if (years < 15) return 'principal';
    return 'expert';
  }

  /**
   * Calculate location matching score
   * @param {Object} candidate - Candidate document
   * @param {Object} jdData - Job description parsed data
   * @returns {Object} Location match result
   */
  calculateLocationMatch(candidate, jdData) {
    const candidateLocation = this.parseLocation(candidate.currentLocation || '');
    const jobLocation = this.parseLocation(jdData.jobLocation || '');
    const preferredLocations = (jdData.preferredLocations || []).map(loc => this.parseLocation(loc));
    const candidatePreferred = (candidate.preferredLocation || []).map(loc => this.parseLocation(loc));

    let score = 0;
    let matchType = 'no-match';
    let matchDetails = {};

    // 1. Exact match (highest priority)
    if (candidateLocation.city && jobLocation.city &&
        this.normalizeLocationName(candidateLocation.city) === this.normalizeLocationName(jobLocation.city)) {
      score = 100;
      matchType = 'exact-city';
      matchDetails = { matchedCity: candidateLocation.city };
    }
    // 2. Same metro area/region
    else if (this.isSameMetroArea(candidateLocation, jobLocation)) {
      score = 95;
      matchType = 'metro-area';
      matchDetails = { metroArea: this.getMetroArea(jobLocation) };
    }
    // 3. Same state/region
    else if (candidateLocation.state && jobLocation.state &&
             this.normalizeLocationName(candidateLocation.state) === this.normalizeLocationName(jobLocation.state)) {
      score = 85;
      matchType = 'same-state';
      matchDetails = { matchedState: candidateLocation.state };
    }
    // 4. Preferred location match
    else if (preferredLocations.some(loc => this.locationsMatch(candidateLocation, loc))) {
      score = 90;
      matchType = 'preferred';
      matchDetails = { preferredLocation: preferredLocations.find(loc => this.locationsMatch(candidateLocation, loc)) };
    }
    // 5. Candidate prefers job location
    else if (candidatePreferred.some(loc => this.locationsMatch(loc, jobLocation))) {
      score = 85;
      matchType = 'candidate-preference';
      matchDetails = { candidatePrefers: jobLocation };
    }
    // 6. Remote work considerations
    else if (jdData.remoteWork === 'remote' || jdData.remoteWork === 'hybrid') {
      score = 70;
      matchType = 'remote-friendly';
      matchDetails = { remoteWork: jdData.remoteWork };
    }
    // 7. Flexible work policy
    else if (jdData.remoteWork === 'flexible') {
      score = 50;
      matchType = 'flexible';
      matchDetails = { flexible: true };
    }
    // 8. Nearby cities (within reasonable distance)
    else if (this.isNearbyLocation(candidateLocation, jobLocation)) {
      const distance = this.calculateLocationDistance(candidateLocation, jobLocation);
      score = Math.max(40, 80 - distance * 5); // Reduce score with distance
      matchType = 'nearby';
      matchDetails = { distance: distance, unit: 'hours' };
    }
    // 9. Same country (last resort for international candidates)
    else if (candidateLocation.country && jobLocation.country &&
             candidateLocation.country === jobLocation.country) {
      score = 30;
      matchType = 'same-country';
      matchDetails = { country: candidateLocation.country };
    }
    // 10. No match
    else {
      score = 0;
      matchType = 'no-match';
      matchDetails = { requiresRelocation: true };
    }

    return {
      score: Math.round(Math.max(0, Math.min(100, score))),
      candidateLocation: candidate.currentLocation,
      jobLocation: jdData.jobLocation,
      preferredLocations: jdData.preferredLocations,
      matchType: matchType,
      matchDetails: matchDetails
    };
  }

  /**
   * Check if two locations are in the same region
   * @param {string} loc1 - First location
   * @param {string} loc2 - Second location
   * @returns {boolean} Whether locations are in same region
   */
  isSameRegion(loc1, loc2) {
    if (!loc1 || !loc2) return false;

    // Simple region mapping for Indian cities
    const regions = {
      'mumbai': ['mumbai', 'thane', 'navi mumbai'],
      'delhi': ['delhi', 'noida', 'gurgaon', 'ghaziabad', 'faridabad'],
      'bangalore': ['bangalore', 'bengaluru'],
      'chennai': ['chennai', 'madras'],
      'pune': ['pune'],
      'hyderabad': ['hyderabad', 'secunderabad'],
      'kolkata': ['kolkata', 'calcutta'],
      'ahmedabad': ['ahmedabad']
    };

    for (const [region, cities] of Object.entries(regions)) {
      if (cities.includes(loc1.toLowerCase()) && cities.includes(loc2.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if locations have common city names
   * @param {string} loc1 - First location
   * @param {string} loc2 - Second location
   * @returns {boolean} Whether locations share city names
   */
  hasCityMatch(loc1, loc2) {
    if (!loc1 || !loc2) return false;

    const cities = ['mumbai', 'delhi', 'bangalore', 'chennai', 'pune', 'hyderabad', 'kolkata', 'ahmedabad', 'jaipur', 'surat', 'noida', 'gurgaon'];

    const loc1Cities = cities.filter(city => loc1.toLowerCase().includes(city));
    const loc2Cities = cities.filter(city => loc2.toLowerCase().includes(city));

    return loc1Cities.some(city => loc2Cities.includes(city));
  }

  /**
   * Calculate education matching score
   * @param {Object} candidate - Candidate document
   * @param {Object} jdData - Job description parsed data
   * @returns {Object} Education match result
   */
  calculateEducationMatch(candidate, jdData) {
    const candidateEducation = (candidate.education || []).map(edu => ({
      degree: (edu.degree || '').toLowerCase(),
      specialization: (edu.specialization || '').toLowerCase()
    }));

    const requiredEducation = [
      ...(jdData.educationRequirements || []),
      ...(jdData.educationRequirementsSimple || []).map(degree => ({ degree, isMandatory: false }))
    ];

    if (requiredEducation.length === 0) {
      return {
        score: 100,
        hasRequiredEducation: true,
        candidateEducation: candidateEducation.map(e => e.degree),
        requiredEducation: [],
        matchType: 'no-requirement'
      };
    }

    let matchedCount = 0;
    const matchedDegrees = [];

    for (const required of requiredEducation) {
      const requiredDegree = (required.degree || '').toLowerCase();
      const requiredSpec = (required.specialization || '').toLowerCase();

      for (const candidateEdu of candidateEducation) {
        if (this.matchesEducationRequirement(candidateEdu, requiredDegree, requiredSpec)) {
          matchedCount++;
          matchedDegrees.push(candidateEdu.degree);
          break; // One match per requirement is enough
        }
      }
    }

    const score = (matchedCount / requiredEducation.length) * 100;

    return {
      score: Math.round(score),
      hasRequiredEducation: matchedCount === requiredEducation.length,
      candidateEducation: candidateEducation.map(e => e.degree),
      requiredEducation: requiredEducation.map(e => e.degree),
      matchedCount: matchedCount,
      totalRequired: requiredEducation.length
    };
  }

  /**
   * Check if candidate education matches requirement
   * @param {Object} candidateEdu - Candidate education
   * @param {string} requiredDegree - Required degree
   * @param {string} requiredSpec - Required specialization
   * @returns {boolean} Whether education matches
   */
  matchesEducationRequirement(candidateEdu, requiredDegree, requiredSpec) {
    const candidateDegree = candidateEdu.degree.toLowerCase();
    const candidateSpec = candidateEdu.specialization.toLowerCase();

    // Check degree match
    const degreeMatch = this.isDegreeMatch(candidateDegree, requiredDegree);

    // Check specialization match
    const specMatch = !requiredSpec ||
      candidateSpec.includes(requiredSpec) ||
      requiredSpec.includes(candidateSpec);

    return degreeMatch && specMatch;
  }

  /**
   * Check if degrees match (with flexibility)
   * @param {string} candidateDegree - Candidate's degree
   * @param {string} requiredDegree - Required degree
   * @returns {boolean} Whether degrees match
   */
  isDegreeMatch(candidateDegree, requiredDegree) {
    if (candidateDegree === requiredDegree) return true;

    // Handle common abbreviations and variations
    const degreeMappings = {
      'bachelor': ['bachelor', 'bachelors', 'b.tech', 'b.e.', 'b.sc', 'b.com', 'b.a.', 'bachelor of technology', 'bachelor of engineering', 'bachelor of science'],
      'master': ['master', 'masters', 'm.tech', 'm.e.', 'm.sc', 'm.com', 'm.a.', 'mba', 'mca', 'master of technology', 'master of engineering', 'master of science'],
      'phd': ['phd', 'doctorate', 'ph.d.', 'doctor of philosophy'],
      'diploma': ['diploma', 'diploma in engineering']
    };

    for (const [baseDegree, variations] of Object.entries(degreeMappings)) {
      if (variations.includes(candidateDegree.toLowerCase()) &&
          variations.includes(requiredDegree.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate salary matching score
   * @param {Object} candidate - Candidate document
   * @param {Object} jdData - Job description parsed data
   * @returns {Object} Salary match result
   */
  calculateSalaryMatch(candidate, jdData) {
    const candidateCTC = candidate.currentCTC || candidate.expectedCTC;
    const salaryRange = jdData.salaryRange;

    if (!candidateCTC || !salaryRange) {
      return {
        score: 50, // Neutral score when salary info not available
        candidateCTC: candidateCTC,
        jobSalaryRange: salaryRange,
        matchType: 'unknown'
      };
    }

    const { min, max } = salaryRange;

    if (candidateCTC >= min && candidateCTC <= max) {
      return {
        score: 100,
        candidateCTC: candidateCTC,
        jobSalaryRange: salaryRange,
        matchType: 'perfect'
      };
    } else if (candidateCTC > max) {
      // Candidate expects more than offered
      const overBy = (candidateCTC - max) / max;
      const score = Math.max(20, 100 - (overBy * 50)); // Penalty for expecting more
      return {
        score: Math.round(score),
        candidateCTC: candidateCTC,
        jobSalaryRange: salaryRange,
        matchType: 'over-expectation'
      };
    } else {
      // Candidate expects less than offered (good!)
      const underBy = (min - candidateCTC) / min;
      const score = Math.min(100, 80 + (underBy * 20)); // Bonus for expecting less
      return {
        score: Math.round(score),
        candidateCTC: candidateCTC,
        jobSalaryRange: salaryRange,
        matchType: 'under-expectation'
      };
    }

    return {
      score: 50, // Neutral score when salary info not available
      candidateCTC: candidateCTC,
      jobSalaryRange: salaryRange,
      matchType: 'unknown'
    };
  }

  /**
   * Bulk match candidates for multiple job descriptions
   * @param {Array} jobDescriptions - Array of JobDescription documents
   * @param {Object} tenantConnection - Tenant database connection
   * @param {Object} options - Matching options
   * @returns {Promise<Array>} Array of job matches with candidates
   */
  async bulkMatchCandidates(jobDescriptions, tenantConnection, options = {}) {
    const results = [];

    for (const jd of jobDescriptions) {
      try {
        const matches = await this.matchCandidates(jd, tenantConnection, options);
        results.push({
          jobDescriptionId: jd._id,
          jobTitle: jd.jobTitle,
          matches: matches,
          totalMatches: matches.length,
          excellentMatches: matches.filter(m => m.overallFit === 'excellent').length,
          goodMatches: matches.filter(m => m.overallFit === 'good').length
        });
      } catch (error) {
        console.error(`Error matching candidates for JD ${jd._id}:`, error);
        results.push({
          jobDescriptionId: jd._id,
          jobTitle: jd.jobTitle,
          error: error.message,
          matches: [],
          totalMatches: 0
        });
      }
    }

    return results;
  }

  /**
   * Get matching statistics for a job description
   * @param {Object} jobDescription - JobDescription document
   * @returns {Object} Matching statistics
   */
  getMatchingStatistics(jobDescription) {
    const matches = jobDescription.candidateMatches || [];

    return {
      totalCandidates: matches.length,
      excellentMatches: matches.filter(m => m.overallFit === 'excellent').length,
      goodMatches: matches.filter(m => m.overallFit === 'good').length,
      averageMatches: matches.filter(m => m.overallFit === 'average').length,
      poorMatches: matches.filter(m => m.overallFit === 'poor').length,
      shortlistedCount: matches.filter(m => m.isShortlisted).length,
      averageScore: matches.length > 0 ?
        Math.round(matches.reduce((sum, m) => sum + m.matchScore, 0) / matches.length) : 0,
      lastMatchedAt: jobDescription.statistics?.lastMatchedAt
    };
  }

  /**
   * Parse location string into structured format
   * @param {string} location - Location string
   * @returns {Object} Parsed location object
   */
  parseLocation(location) {
    if (!location) return {};

    const normalized = location.toLowerCase().trim();

    // Common location patterns
    const patterns = {
      'delhi': { city: 'Delhi', state: 'Delhi', country: 'India' },
      'noida': { city: 'Noida', state: 'Uttar Pradesh', country: 'India' },
      'gurgaon': { city: 'Gurgaon', state: 'Haryana', country: 'India' },
      'ghaziabad': { city: 'Ghaziabad', state: 'Uttar Pradesh', country: 'India' },
      'faridabad': { city: 'Faridabad', state: 'Haryana', country: 'India' },
      'mumbai': { city: 'Mumbai', state: 'Maharashtra', country: 'India' },
      'pune': { city: 'Pune', state: 'Maharashtra', country: 'India' },
      'bangalore': { city: 'Bangalore', state: 'Karnataka', country: 'India' },
      'bengaluru': { city: 'Bangalore', state: 'Karnataka', country: 'India' },
      'chennai': { city: 'Chennai', state: 'Tamil Nadu', country: 'India' },
      'hyderabad': { city: 'Hyderabad', state: 'Telangana', country: 'India' },
      'kolkata': { city: 'Kolkata', state: 'West Bengal', country: 'India' },
      'ahmedabad': { city: 'Ahmedabad', state: 'Gujarat', country: 'India' },
      'jaipur': { city: 'Jaipur', state: 'Rajasthan', country: 'India' },
      'surat': { city: 'Surat', state: 'Gujarat', country: 'India' }
    };

    // Check for exact matches
    for (const [key, value] of Object.entries(patterns)) {
      if (normalized.includes(key)) {
        return value;
      }
    }

    // Try to extract city and state from common formats
    const parts = normalized.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      return {
        city: parts[0],
        state: parts[1],
        country: parts[2] || 'India'
      };
    }

    // Fallback - treat as city
    return {
      city: location,
      country: 'India'
    };
  }

  /**
   * Check if two locations match
   * @param {Object} loc1 - First location object
   * @param {Object} loc2 - Second location object
   * @returns {boolean} Whether locations match
   */
  locationsMatch(loc1, loc2) {
    if (!loc1 || !loc2) return false;

    // Exact city match
    if (loc1.city && loc2.city &&
        this.normalizeLocationName(loc1.city) === this.normalizeLocationName(loc2.city)) {
      return true;
    }

    // Same metro area
    if (this.isSameMetroArea(loc1, loc2)) {
      return true;
    }

    return false;
  }

  /**
   * Check if locations are in the same metro area
   * @param {Object} loc1 - First location
   * @param {Object} loc2 - Second location
   * @returns {boolean} Whether in same metro area
   */
  isSameMetroArea(loc1, loc2) {
    const metroAreas = {
      'delhi-ncr': ['delhi', 'noida', 'gurgaon', 'ghaziabad', 'faridabad'],
      'mumbai': ['mumbai', 'thane', 'navi mumbai'],
      'pune': ['pune'],
      'bangalore': ['bangalore', 'bengaluru'],
      'chennai': ['chennai'],
      'hyderabad': ['hyderabad'],
      'kolkata': ['kolkata']
    };

    for (const [area, cities] of Object.entries(metroAreas)) {
      const city1 = this.normalizeLocationName(loc1.city);
      const city2 = this.normalizeLocationName(loc2.city);

      if (cities.includes(city1) && cities.includes(city2)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get metro area for a location
   * @param {Object} location - Location object
   * @returns {string} Metro area name
   */
  getMetroArea(location) {
    const city = this.normalizeLocationName(location.city);

    if (['delhi', 'noida', 'gurgaon', 'ghaziabad', 'faridabad'].includes(city)) {
      return 'Delhi-NCR';
    }
    if (['mumbai', 'thane', 'navi mumbai'].includes(city)) {
      return 'Mumbai';
    }

    return location.city || 'Unknown';
  }

  /**
   * Check if locations are nearby (rough estimate)
   * @param {Object} loc1 - First location
   * @param {Object} loc2 - Second location
   * @returns {boolean} Whether locations are nearby
   */
  isNearbyLocation(loc1, loc2) {
    // Simple distance check for Indian cities
    const distances = {
      'delhi-noida': 1,
      'delhi-gurgaon': 1,
      'noida-gurgaon': 1.5,
      'mumbai-pune': 3,
      'bangalore-chennai': 6
    };

    const key1 = `${this.normalizeLocationName(loc1.city)}-${this.normalizeLocationName(loc2.city)}`;
    const key2 = `${this.normalizeLocationName(loc2.city)}-${this.normalizeLocationName(loc1.city)}`;

    return distances[key1] !== undefined || distances[key2] !== undefined;
  }

  /**
   * Calculate rough travel distance between locations
   * @param {Object} loc1 - First location
   * @param {Object} loc2 - Second location
   * @returns {number} Distance in hours
   */
  calculateLocationDistance(loc1, loc2) {
    const distances = {
      'delhi-noida': 1,
      'delhi-gurgaon': 1,
      'noida-gurgaon': 1.5,
      'mumbai-pune': 3,
      'bangalore-chennai': 6
    };

    const key1 = `${this.normalizeLocationName(loc1.city)}-${this.normalizeLocationName(loc2.city)}`;
    const key2 = `${this.normalizeLocationName(loc2.city)}-${this.normalizeLocationName(loc1.city)}`;

    return distances[key1] || distances[key2] || 12; // Default 12 hours for unknown distances
  }

  /**
   * Normalize location name for comparison
   * @param {string} name - Location name
   * @returns {string} Normalized name
   */
  normalizeLocationName(name) {
    return (name || '').toLowerCase().trim().replace(/[^a-z]/g, '');
  }
}

module.exports = new CandidateMatchingService();