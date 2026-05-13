/**
 * Intelligent Resume Search Service
 * Implements AI-powered search with skill normalization, semantic matching, fuzzy matching, and scoring
 */

// Skill normalization mappings (synonyms and variations)
const skillNormalizationMap = {
  // JavaScript variations
  'js': ['javascript', 'ecmascript', 'js', 'nodejs', 'node.js', 'node js', 'reactjs', 'react.js', 'vuejs', 'vue.js', 'angularjs', 'angular.js'],
  'javascript': ['javascript', 'ecmascript', 'js', 'nodejs', 'node.js', 'node js', 'reactjs', 'react.js', 'vuejs', 'vue.js', 'angularjs', 'angular.js'],
  'node': ['nodejs', 'node.js', 'node js', 'node', 'nodejs backend', 'node backend'],
  'nodejs': ['nodejs', 'node.js', 'node js', 'node', 'nodejs backend', 'node backend'],
  'react': ['reactjs', 'react.js', 'react', 'reactjs frontend', 'react frontend'],
  'reactjs': ['reactjs', 'react.js', 'react', 'reactjs frontend', 'react frontend'],
  'vue': ['vuejs', 'vue.js', 'vue', 'vuejs frontend'],
  'angular': ['angularjs', 'angular.js', 'angular', 'angularjs framework'],
  
  // Database variations
  'mongodb': ['mongodb', 'mongo', 'mongo db', 'mongo database'],
  'mongo': ['mongodb', 'mongo', 'mongo db', 'mongo database'],
  'postgresql': ['postgresql', 'postgres', 'pg', 'postgres db'],
  'postgres': ['postgresql', 'postgres', 'pg', 'postgres db'],
  'mysql': ['mysql', 'my sql', 'mysql database'],
  'sql': ['sql', 'structured query language', 'sql server', 'sqlite', 'postgresql', 'mysql', 'oracle sql', 'tsql', 'plsql'],
  'sqlite': ['sqlite', 'sql', 'sqlite3'],
  'oracle': ['oracle', 'oracle sql', 'oracle database', 'plsql'],
  
  // Cloud/AWS variations
  'aws': ['aws', 'amazon web services', 'amazon aws', 'ec2', 's3', 'lambda'],
  'amazon web services': ['aws', 'amazon web services', 'amazon aws'],
  'azure': ['azure', 'microsoft azure', 'azure cloud'],
  'gcp': ['gcp', 'google cloud', 'google cloud platform'],
  
  // DevOps variations
  'docker': ['docker', 'containerization', 'containers', 'docker containers'],
  'containerization': ['docker', 'containerization', 'containers'],
  'kubernetes': ['kubernetes', 'k8s', 'kube', 'kubernetes orchestration'],
  'k8s': ['kubernetes', 'k8s', 'kube'],
  
  // Framework variations
  'express': ['expressjs', 'express.js', 'express', 'express framework'],
  'expressjs': ['expressjs', 'express.js', 'express'],
  
  // API variations
  'rest': ['rest', 'rest api', 'restful', 'restful api'],
  'graphql': ['graphql', 'graph ql', 'graphql api'],
  
  // Frontend variations
  'html': ['html', 'html5', 'html 5'],
  'css': ['css', 'css3', 'css 3', 'scss', 'sass', 'less'],
  
  // Backend variations
  'backend': ['backend', 'back-end', 'server', 'server-side', 'api development'],
  'frontend': ['frontend', 'front-end', 'client-side', 'ui', 'ux'],
  'full stack': ['full stack', 'fullstack', 'full-stack', 'fullstack developer'],
  'fullstack': ['full stack', 'fullstack', 'full-stack'],
};

// Contextual skill groupings
const contextualGroups = {
  'backend developer': {
    primary: ['node', 'nodejs', 'express', 'mongodb', 'postgresql', 'mysql', 'rest', 'graphql', 'api', 'authentication', 'authorization', 'jwt', 'oauth'],
    secondary: ['aws', 'docker', 'kubernetes', 'microservices', 'redis', 'rabbitmq', 'kafka'],
    jobTitles: ['backend developer', 'backend engineer', 'server developer', 'api developer', 'node.js developer', 'backend engineer']
  },
  'frontend developer': {
    primary: ['react', 'vue', 'angular', 'javascript', 'typescript', 'html', 'css', 'sass', 'scss', 'ui', 'ux', 'responsive design', 'accessibility', 'performance optimization'],
    secondary: ['webpack', 'babel', 'redux', 'vuex', 'next.js', 'nuxt.js', 'angularjs'],
    jobTitles: ['frontend developer', 'frontend engineer', 'ui developer', 'react developer', 'vue developer', 'angular developer']
  },
  'full stack developer': {
    primary: ['node', 'react', 'express', 'mongodb', 'javascript', 'typescript', 'rest', 'graphql', 'html', 'css'],
    secondary: ['aws', 'docker', 'kubernetes', 'postgresql', 'redis', 'vue', 'angular'],
    jobTitles: ['full stack developer', 'fullstack developer', 'full stack engineer', 'full stack developer', 'mern developer', 'mean developer']
  },
  'devops engineer': {
    primary: ['docker', 'kubernetes', 'ci/cd', 'jenkins', 'gitlab', 'github actions', 'terraform', 'ansible', 'aws', 'azure', 'gcp'],
    secondary: ['linux', 'bash', 'python', 'monitoring', 'logging', 'prometheus', 'grafana'],
    jobTitles: ['devops engineer', 'devops', 'site reliability engineer', 'sre', 'cloud engineer']
  }
};

/**
 * Normalize a skill term by finding all its variations
 */
function normalizeSkill(skill) {
  const normalized = skill.toLowerCase().trim();
  
  // Direct match in normalization map
  if (skillNormalizationMap[normalized]) {
    return skillNormalizationMap[normalized];
  }
  
  // Check if skill contains any mapped term
  for (const [key, variations] of Object.entries(skillNormalizationMap)) {
    if (variations.some(v => normalized.includes(v) || v.includes(normalized))) {
      return variations;
    }
  }
  
  // Return original as array for consistency
  return [normalized];
}

/**
 * Calculate fuzzy similarity between two strings (Levenshtein distance based)
 */
function fuzzySimilarity(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.8;
  }
  
  // Simple Levenshtein distance calculation
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  const editDistance = levenshteinDistance(s1, s2);
  
  if (longer.length === 0) return 1.0;
  
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];
  const len1 = str1.length;
  const len2 = str2.length;
  
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  return matrix[len1][len2];
}

/**
 * Extract skills and keywords from search query
 */
function extractSearchTerms(query) {
  const normalized = query.toLowerCase().trim();
  const terms = [];
  
  // Check for contextual groups (e.g., "backend developer")
  for (const [context, group] of Object.entries(contextualGroups)) {
    if (normalized.includes(context)) {
      terms.push({
        type: 'contextual',
        value: context,
        skills: [...group.primary, ...group.secondary],
        jobTitles: group.jobTitles
      });
    }
  }
  
  // Extract individual skills
  const words = normalized.split(/\s+/);
  for (const word of words) {
    if (word.length >= 2) { // Allow 2+ character words (like "sql")
      const normalizedVariations = normalizeSkill(word);
      if (normalizedVariations && normalizedVariations.length > 0) {
        terms.push({
          type: 'skill',
          value: word,
          variations: normalizedVariations
        });
      } else {
        // Even if not in normalization map, add as a skill term for fuzzy matching
        terms.push({
          type: 'skill',
          value: word,
          variations: [word.toLowerCase()]
        });
      }
    }
  }
  
  return terms;
}

/**
 * Score a resume against search terms
 */
function scoreResume(resume, searchTerms, query) {
  let totalScore = 0;
  let maxPossibleScore = 0;
  const matchedSkills = [];
  const reasons = [];
  
  const resumeSkills = (resume.parsedData?.skills || []).map(s => s.toLowerCase());
  const resumeText = (resume.searchableText || resume.rawText || '').toLowerCase();
  const jobTitle = (resume.parsedData?.currentDesignation || '').toLowerCase();
  const experience = resume.parsedData?.experience?.years || 0;
  
  // Process contextual terms (e.g., "backend developer")
  for (const term of searchTerms) {
    if (term.type === 'contextual') {
      const primaryMatches = term.skills.filter(skill => 
        resumeSkills.some(rs => {
          const normalized = normalizeSkill(skill);
          return normalized.some(n => rs.includes(n) || n.includes(rs));
        })
      );
      
      const jobTitleMatch = term.jobTitles.some(jt => jobTitle.includes(jt));
      
      if (primaryMatches.length > 0 || jobTitleMatch) {
        const contextualScore = (primaryMatches.length / term.skills.length) * 40; // 40 points max
        totalScore += contextualScore;
        maxPossibleScore += 40;
        
        if (jobTitleMatch) {
          totalScore += 10; // Bonus for job title match
          maxPossibleScore += 10;
          reasons.push(`Job title matches "${term.value}"`);
        }
        
        if (primaryMatches.length > 0) {
          matchedSkills.push(...primaryMatches);
          reasons.push(`Matched ${primaryMatches.length} ${term.value} skills: ${primaryMatches.slice(0, 3).join(', ')}`);
        }
      } else {
        maxPossibleScore += 40;
      }
    }
    
    // Process individual skill terms
    if (term.type === 'skill') {
      let skillMatched = false;
      let bestMatch = null;
      let bestScore = 0;
      
      // Check exact matches and substring matches in skills
      for (const resumeSkill of resumeSkills) {
        for (const variation of term.variations) {
          // First check for substring matches (e.g., "node" in "nodejs" or "nodejs" in "node")
          if (resumeSkill.includes(variation) || variation.includes(resumeSkill)) {
            skillMatched = true;
            const exactMatch = resumeSkill === variation;
            const currentScore = exactMatch ? 1.0 : 0.85;
            if (currentScore > bestScore) {
              bestScore = currentScore;
              bestMatch = resumeSkill;
            }
          }
          
          // Also check fuzzy similarity (for typos and variations)
          const similarity = fuzzySimilarity(resumeSkill, variation);
          if (similarity > 0.6 && similarity > bestScore) { // Lower threshold for more matches
            skillMatched = true;
            bestScore = similarity;
            bestMatch = resumeSkill;
          }
        }
      }
      
      // Check in resume text if not found in skills
      if (!skillMatched) {
        for (const variation of term.variations) {
          if (resumeText.includes(variation)) {
            skillMatched = true;
            bestMatch = variation;
            bestScore = 0.6; // Lower score for text match vs skill match
            break;
          }
        }
      }
      
      if (skillMatched) {
        const skillScore = bestScore * 30; // 30 points max per skill
        totalScore += skillScore;
        maxPossibleScore += 30;
        matchedSkills.push(bestMatch || term.value);
        reasons.push(`Matched skill: ${bestMatch || term.value}`);
      } else {
        maxPossibleScore += 30;
      }
    }
  }
  
  // Experience bonus (up to 10 points)
  if (experience >= 3) {
    const expScore = Math.min(experience / 10, 1) * 10;
    totalScore += expScore;
    reasons.push(`${experience} years of experience`);
  }
  maxPossibleScore += 10;
  
  // Fuzzy matching on full query (fallback, up to 10 points)
  if (searchTerms.length === 0) {
    const fuzzyMatch = fuzzySimilarity(resumeText, query);
    if (fuzzyMatch > 0.5) {
      totalScore += fuzzyMatch * 10;
      reasons.push(`Partial text match (${Math.round(fuzzyMatch * 100)}% similarity)`);
    }
    maxPossibleScore += 10;
  }
  
  // Calculate final relevance score (0-100)
  const relevanceScore = maxPossibleScore > 0 
    ? Math.round((totalScore / maxPossibleScore) * 100)
    : 0;
  
  // Generate reason summary
  let reason = reasons.length > 0 
    ? reasons.join('. ')
    : 'General match based on resume content';
  
  if (matchedSkills.length === 0 && reasons.length === 0) {
    reason = 'Partial match - may contain related experience';
  }
  
  return {
    relevanceScore: Math.min(relevanceScore, 100), // Cap at 100
    matchedSkills: [...new Set(matchedSkills)], // Remove duplicates
    reason,
    totalScore,
    maxPossibleScore
  };
}

/**
 * Intelligent search - main entry point
 */
function intelligentSearch(resumes, query) {
  if (!query || !query.trim()) {
    // Return all resumes with default scores if no query
    return resumes.map(resume => ({
      candidateId: resume._id.toString(),
      name: resume.name || 'Unnamed Candidate',
      email: resume.email || '',
      phone: resume.phone || '',
      relevanceScore: 50,
      matchedSkills: [],
      experienceYears: resume.parsedData?.experience?.years || 0,
      reason: 'No search query provided - showing all candidates'
    }));
  }
  
  // Extract search terms
  const searchTerms = extractSearchTerms(query);
  
  // Score each resume
  const scoredResumes = resumes.map(resume => {
    const scoring = scoreResume(resume, searchTerms, query);
    return {
      candidateId: resume._id.toString(),
      name: resume.name || 'Unnamed Candidate',
      email: resume.email || '',
      phone: resume.phone || '',
      relevanceScore: scoring.relevanceScore,
      matchedSkills: scoring.matchedSkills,
      experienceYears: resume.parsedData?.experience?.years || 0,
      experienceMonths: resume.parsedData?.experience?.months || 0,
      reason: scoring.reason,
      resume: resume // Keep original for filtering
    };
  });
  
  // Sort by relevance score (descending)
  scoredResumes.sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  // Filter out very low relevance scores (below 20%) unless there are no better matches
  // This prevents showing completely unrelated results
  const highRelevanceResults = scoredResumes.filter(r => r.relevanceScore >= 20);
  
  // If we have high relevance results, only return those
  // Otherwise, return top 10 results even if low-scoring (to show "closest matches")
  if (highRelevanceResults.length > 0) {
    return highRelevanceResults;
  } else {
    // No good matches - return top 10 as "closest matches"
    return scoredResumes.slice(0, 10);
  }
}

module.exports = {
  intelligentSearch,
  normalizeSkill,
  fuzzySimilarity,
  extractSearchTerms,
  scoreResume
};
