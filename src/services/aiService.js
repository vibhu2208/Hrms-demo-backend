const axios = require('axios');

/**
 * AI Service for Candidate Analysis
 * Handles AI-powered candidate matching, ranking, and resume analysis using Gemini API
 * Falls back to DeepSeek and OpenAI if Gemini is not available
 */
class AIService {
  constructor() {
    // Gemini Configuration
    this.geminiApiKey = process.env.GEMINI_API_KEY || 'AIzaSyBU2gMW-fzkMSrFFL7dXQ4I5UABrKrtaIo';
    this.geminiModel = 'gemini-2.0-flash-exp';
    this.geminiBaseURL = 'https://generativelanguage.googleapis.com/v1beta';
    this.useGemini = !!this.geminiApiKey;

    // Fallback to DeepSeek
    this.deepseekApiKey = process.env.DEEPSEEK_API_KEY;
    this.deepseekModel = process.env.DEEPSEEK_MODEL || 'deepseek-v3';
    this.embeddingModel = process.env.DEEPSEEK_EMBEDDING_MODEL || 'deepseek-embedding';
    this.deepseekBaseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
    this.useDeepSeek = !!this.deepseekApiKey && !this.useGemini;

    // Fallback to OpenAI
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.openaiModel = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
    this.openaiEmbeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002';
    this.useOpenAI = !!this.openaiApiKey && !this.useGemini && !this.useDeepSeek;

    // General settings
    this.maxTokens = parseInt(process.env.DEEPSEEK_MAX_TOKENS) || 4096;
    this.temperature = parseFloat(process.env.DEEPSEEK_TEMPERATURE) || 0.7;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Get embeddings from available AI service
   */
  async getEmbedding(text) {
    if (this.useGemini) {
      return this.getGeminiEmbedding(text);
    } else if (this.useDeepSeek) {
      return this.getDeepSeekEmbedding(text);
    } else if (this.useOpenAI) {
      return this.getOpenAIEmbedding(text);
    } else {
      throw new Error('No AI API key configured');
    }
  }

  /**
   * Get embeddings from Gemini API
   */
  async getGeminiEmbedding(text) {
    if (!this.useGemini) {
      throw new Error('Gemini API key not configured');
    }

    try {
      const response = await axios.post(
        `${this.geminiBaseURL}/models/${this.geminiModel}:embedContent?key=${this.geminiApiKey}`,
        {
          content: {
            parts: [
              {
                text: text
              }
            ]
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.embedding.values;
    } catch (error) {
      console.error('Error getting Gemini embedding:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get embeddings from DeepSeek API
   */
  async getDeepSeekEmbedding(text) {
    if (!this.useDeepSeek) {
      throw new Error('DeepSeek API key not configured');
    }

    try {
      const response = await axios.post(
        `${this.deepseekBaseURL}/embeddings`,
        {
          input: text,
          model: this.embeddingModel
        },
        {
          headers: {
            'Authorization': `Bearer ${this.deepseekApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.data[0].embedding;
    } catch (error) {
      console.error('Error getting DeepSeek embedding:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get embeddings from OpenAI (fallback)
   */
  async getOpenAIEmbedding(text) {
    if (!this.useOpenAI) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          input: text,
          model: this.openaiEmbeddingModel
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.data[0].embedding;
    } catch (error) {
      console.error('Error getting OpenAI embedding:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Calculate semantic similarity between job description and candidate profile
   */
  async calculateSemanticSimilarity(jobDescription, candidateProfile) {
    try {
      if (this.useGemini || this.useDeepSeek || this.useOpenAI) {
        const [jobEmbedding, candidateEmbedding] = await Promise.all([
          this.getEmbedding(jobDescription),
          this.getEmbedding(candidateProfile)
        ]);

        const similarity = this.cosineSimilarity(jobEmbedding, candidateEmbedding);
        return Math.round(similarity * 100);
      } else {
        // Fallback to keyword-based matching
        return this.keywordBasedSimilarity(jobDescription, candidateProfile);
      }
    } catch (error) {
      console.error('Error calculating semantic similarity:', error);
      // Fallback to keyword-based matching
      return this.keywordBasedSimilarity(jobDescription, candidateProfile);
    }
  }

  /**
   * Keyword-based similarity (fallback when AI APIs are not available)
   */
  keywordBasedSimilarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().match(/\b\w+\b/g) || []);
    const words2 = new Set(text2.toLowerCase().match(/\b\w+\b/g) || []);

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return Math.round((intersection.size / union.size) * 100);
  }

  /**
   * Analyze skills match between job requirements and candidate skills
   */
  analyzeSkillsMatch(requiredSkills = [], candidateSkills = []) {
    const required = requiredSkills.map(s => s.toLowerCase().trim());
    const candidate = candidateSkills.map(s => s.toLowerCase().trim());
    
    const matched = required.filter(skill => 
      candidate.some(cs => cs.includes(skill) || skill.includes(cs))
    );
    
    const missing = required.filter(skill => 
      !candidate.some(cs => cs.includes(skill) || skill.includes(cs))
    );
    
    const additional = candidate.filter(skill => 
      !required.some(rs => rs.includes(skill) || skill.includes(rs))
    );
    
    const matchPercentage = required.length > 0 
      ? Math.round((matched.length / required.length) * 100) 
      : 100;
    
    return {
      matched: matched.map(s => requiredSkills.find(rs => rs.toLowerCase() === s)),
      missing: missing.map(s => requiredSkills.find(rs => rs.toLowerCase() === s)),
      additional: additional.slice(0, 10), // Limit to top 10 additional skills
      matchPercentage
    };
  }

  /**
   * Analyze experience match
   */
  analyzeExperienceMatch(requiredExp, candidateExp) {
    const candidateYears = (candidateExp?.years || 0) + (candidateExp?.months || 0) / 12;
    const minRequired = requiredExp?.min || 0;
    const maxRequired = requiredExp?.max || 999;
    
    let score = 0;
    let isMatch = false;
    
    if (candidateYears >= minRequired && candidateYears <= maxRequired) {
      score = 100;
      isMatch = true;
    } else if (candidateYears < minRequired) {
      const diff = minRequired - candidateYears;
      score = Math.max(0, 100 - (diff * 20)); // Penalize 20 points per year short
      isMatch = diff <= 1; // Within 1 year is acceptable
    } else {
      const diff = candidateYears - maxRequired;
      score = Math.max(50, 100 - (diff * 10)); // Penalize 10 points per year over
      isMatch = diff <= 2; // Up to 2 years over is acceptable
    }
    
    return {
      isMatch,
      candidateYears: Math.round(candidateYears * 10) / 10,
      requiredYears: `${minRequired}-${maxRequired}`,
      score: Math.round(score)
    };
  }

  /**
   * Generate AI-powered insights using available AI service
   */
  async generateAIInsights(jobPosting, candidate, skillsMatch, experienceMatch) {
    if (this.useGemini) {
      return this.generateGeminiInsights(jobPosting, candidate, skillsMatch, experienceMatch);
    } else if (this.useDeepSeek) {
      return this.generateDeepSeekInsights(jobPosting, candidate, skillsMatch, experienceMatch);
    } else if (this.useOpenAI) {
      return this.generateOpenAIInsights(jobPosting, candidate, skillsMatch, experienceMatch);
    } else {
      return this.generateRuleBasedInsights(jobPosting, candidate, skillsMatch, experienceMatch);
    }
  }

  /**
   * Generate insights using Gemini API
   */
  async generateGeminiInsights(jobPosting, candidate, skillsMatch, experienceMatch) {
    try {
      const prompt = `Analyze this candidate for the job position and provide insights:

Job Title: ${jobPosting.title}
Job Description: ${jobPosting.description}
Required Skills: ${jobPosting.skills?.join(', ') || 'Not specified'}
Required Experience: ${jobPosting.experience?.min || 0}-${jobPosting.experience?.max || 'N/A'} years

Candidate:
Name: ${candidate.firstName} ${candidate.lastName}
Experience: ${candidate.experience?.years || 0} years ${candidate.experience?.months || 0} months
Skills: ${candidate.skills?.join(', ') || 'Not specified'}
Current Role: ${candidate.currentDesignation || 'Not specified'}
Education: ${candidate.education?.map(e => `${e.degree} in ${e.specialization}`).join(', ') || 'Not specified'}

Skills Analysis:
- Matched Skills: ${skillsMatch.matched.join(', ') || 'None'}
- Missing Skills: ${skillsMatch.missing.join(', ') || 'None'}
- Match Percentage: ${skillsMatch.matchPercentage}%

Experience Match: ${experienceMatch.isMatch ? 'Yes' : 'No'} (Score: ${experienceMatch.score})

Provide a JSON response with:
1. keyHighlights: Array of 3-5 key strengths (strings)
2. weaknesses: Array of 2-3 areas of concern (strings)
3. overallFit: One of ["excellent", "good", "average", "poor"]
4. recommendation: Brief recommendation (string)

Return ONLY valid JSON, no markdown or extra text.`;

      const response = await axios.post(
        `${this.geminiBaseURL}/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`,
        {
          contents: [
            {
              parts: [
                {
                  text: `You are an expert HR analyst. Provide concise, actionable insights in JSON format.\n\n${prompt}`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: this.temperature,
            maxOutputTokens: this.maxTokens
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.candidates[0]?.content?.parts[0]?.text?.trim();
      if (!content) {
        throw new Error('No content received from Gemini API');
      }

      // Remove markdown code blocks if present
      const jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const insights = JSON.parse(jsonContent);

      return {
        keyHighlights: insights.keyHighlights || [],
        weaknesses: insights.weaknesses || [],
        overallFit: insights.overallFit || 'average',
        recommendations: insights.recommendation ? [insights.recommendation] : []
      };
    } catch (error) {
      console.error('Error generating Gemini insights:', error.response?.data || error.message);
      return this.generateRuleBasedInsights(jobPosting, candidate, skillsMatch, experienceMatch);
    }
  }

  /**
   * Generate insights using DeepSeek API
   */
  async generateDeepSeekInsights(jobPosting, candidate, skillsMatch, experienceMatch) {
    try {
      const prompt = `Analyze this candidate for the job position and provide insights:

Job Title: ${jobPosting.title}
Job Description: ${jobPosting.description}
Required Skills: ${jobPosting.skills?.join(', ') || 'Not specified'}
Required Experience: ${jobPosting.experience?.min || 0}-${jobPosting.experience?.max || 'N/A'} years

Candidate:
Name: ${candidate.firstName} ${candidate.lastName}
Experience: ${candidate.experience?.years || 0} years ${candidate.experience?.months || 0} months
Skills: ${candidate.skills?.join(', ') || 'Not specified'}
Current Role: ${candidate.currentDesignation || 'Not specified'}
Education: ${candidate.education?.map(e => `${e.degree} in ${e.specialization}`).join(', ') || 'Not specified'}

Skills Analysis:
- Matched Skills: ${skillsMatch.matched.join(', ') || 'None'}
- Missing Skills: ${skillsMatch.missing.join(', ') || 'None'}
- Match Percentage: ${skillsMatch.matchPercentage}%

Experience Match: ${experienceMatch.isMatch ? 'Yes' : 'No'} (Score: ${experienceMatch.score})

Provide a JSON response with:
1. keyHighlights: Array of 3-5 key strengths (strings)
2. weaknesses: Array of 2-3 areas of concern (strings)
3. overallFit: One of ["excellent", "good", "average", "poor"]
4. recommendation: Brief recommendation (string)

Return ONLY valid JSON, no markdown or extra text.`;

      const response = await axios.post(
        `${this.deepseekBaseURL}/chat/completions`,
        {
          model: this.deepseekModel,
          messages: [
            { role: 'system', content: 'You are an expert HR analyst. Provide concise, actionable insights in JSON format.' },
            { role: 'user', content: prompt }
          ],
          temperature: this.temperature,
          max_tokens: this.maxTokens
        },
        {
          headers: {
            'Authorization': `Bearer ${this.deepseekApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0].message.content.trim();
      // Remove markdown code blocks if present
      const jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const insights = JSON.parse(jsonContent);

      return {
        keyHighlights: insights.keyHighlights || [],
        weaknesses: insights.weaknesses || [],
        overallFit: insights.overallFit || 'average'
      };
    } catch (error) {
      console.error('Error generating DeepSeek insights:', error.response?.data || error.message);
      return this.generateRuleBasedInsights(jobPosting, candidate, skillsMatch, experienceMatch);
    }
  }

  /**
   * Generate insights using OpenAI API (fallback)
   */
  async generateOpenAIInsights(jobPosting, candidate, skillsMatch, experienceMatch) {
    try {
      const prompt = `Analyze this candidate for the job position and provide insights:

Job Title: ${jobPosting.title}
Job Description: ${jobPosting.description}
Required Skills: ${jobPosting.skills?.join(', ') || 'Not specified'}
Required Experience: ${jobPosting.experience?.min || 0}-${jobPosting.experience?.max || 'N/A'} years

Candidate:
Name: ${candidate.firstName} ${candidate.lastName}
Experience: ${candidate.experience?.years || 0} years ${candidate.experience?.months || 0} months
Skills: ${candidate.skills?.join(', ') || 'Not specified'}
Current Role: ${candidate.currentDesignation || 'Not specified'}
Education: ${candidate.education?.map(e => `${e.degree} in ${e.specialization}`).join(', ') || 'Not specified'}

Skills Analysis:
- Matched Skills: ${skillsMatch.matched.join(', ') || 'None'}
- Missing Skills: ${skillsMatch.missing.join(', ') || 'None'}
- Match Percentage: ${skillsMatch.matchPercentage}%

Experience Match: ${experienceMatch.isMatch ? 'Yes' : 'No'} (Score: ${experienceMatch.score})

Provide a JSON response with:
1. keyHighlights: Array of 3-5 key strengths (strings)
2. weaknesses: Array of 2-3 areas of concern (strings)
3. overallFit: One of ["excellent", "good", "average", "poor"]
4. recommendation: Brief recommendation (string)

Return ONLY valid JSON, no markdown or extra text.`;

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.openaiModel,
          messages: [
            { role: 'system', content: 'You are an expert HR analyst. Provide concise, actionable insights in JSON format.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0].message.content.trim();
      // Remove markdown code blocks if present
      const jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const insights = JSON.parse(jsonContent);

      return {
        keyHighlights: insights.keyHighlights || [],
        weaknesses: insights.weaknesses || [],
        overallFit: insights.overallFit || 'average'
      };
    } catch (error) {
      console.error('Error generating OpenAI insights:', error.response?.data || error.message);
      return this.generateRuleBasedInsights(jobPosting, candidate, skillsMatch, experienceMatch);
    }
  }

  /**
   * Generate rule-based insights (fallback) - Enhanced with specific details
   */
  generateRuleBasedInsights(jobPosting, candidate, skillsMatch, experienceMatch) {
    const highlights = [];
    const weaknesses = [];
    const recommendations = [];
    
    // Detailed skill analysis
    if (skillsMatch.matchPercentage >= 80) {
      highlights.push(`🎯 Excellent skill match: ${skillsMatch.matchPercentage}% of required skills aligned`);
    } else if (skillsMatch.matchPercentage >= 60) {
      highlights.push(`✓ Good skill match: ${skillsMatch.matchPercentage}% of required skills aligned`);
    } else if (skillsMatch.matchPercentage >= 40) {
      highlights.push(`△ Moderate skill match: ${skillsMatch.matchPercentage}% of required skills aligned`);
    } else {
      weaknesses.push(`⚠️ Limited skill match: Only ${skillsMatch.matchPercentage}% of required skills present`);
    }
    
    // Detailed experience analysis
    if (experienceMatch.isMatch) {
      highlights.push(`✓ Experience aligns perfectly: ${experienceMatch.candidateYears} years (Required: ${experienceMatch.requiredYears})`);
    } else if (experienceMatch.score >= 70) {
      highlights.push(`△ Experience close to requirement: ${experienceMatch.candidateYears} years (Required: ${experienceMatch.requiredYears})`);
    } else {
      weaknesses.push(`⚠️ Experience gap: Has ${experienceMatch.candidateYears} years, requires ${experienceMatch.requiredYears}`);
    }
    
    // Matched skills with confidence
    if (skillsMatch.matched.length > 0) {
      const topMatched = skillsMatch.matched.slice(0, 5);
      highlights.push(`💪 Core competencies: ${topMatched.join(', ')}`);
    }
    
    // Missing skills with learning potential
    if (skillsMatch.missing.length > 0) {
      const topMissing = skillsMatch.missing.slice(0, 3);
      weaknesses.push(`📚 Skills to develop: ${topMissing.join(', ')}`);
      recommendations.push(`Candidate can acquire missing skills through training: ${topMissing.join(', ')}`);
    }
    
    // Additional highlights
    if (candidate.currentCompany) {
      highlights.push(`🏢 Currently at: ${candidate.currentCompany}`);
    }
    
    if (candidate.education && candidate.education.length > 0) {
      const degrees = candidate.education.map(e => e.degree).join(', ');
      highlights.push(`🎓 Education: ${degrees}`);
    }
    
    // Additional skills analysis
    if (skillsMatch.additional && skillsMatch.additional.length > 0) {
      const bonus = skillsMatch.additional.slice(0, 3);
      highlights.push(`⭐ Bonus skills: ${bonus.join(', ')}`);
    }
    
    // Career progression potential
    if (candidate.experience?.years >= 5) {
      highlights.push(`📈 Senior level candidate with proven track record`);
    } else if (candidate.experience?.years >= 2) {
      highlights.push(`📊 Mid-level candidate with solid foundation`);
    } else if (candidate.experience?.years > 0) {
      recommendations.push(`Candidate is early-career; may need mentoring and support`);
    }
    
    // Determine overall fit with detailed reasoning
    let overallFit = 'average';
    if (skillsMatch.matchPercentage >= 80 && experienceMatch.score >= 80) {
      overallFit = 'excellent';
      recommendations.push(`Strong candidate - ready to contribute immediately`);
    } else if (skillsMatch.matchPercentage >= 60 && experienceMatch.score >= 60) {
      overallFit = 'good';
      recommendations.push(`Good fit - may need brief onboarding for specific tools/processes`);
    } else if (skillsMatch.matchPercentage >= 40 && experienceMatch.score >= 40) {
      overallFit = 'average';
      recommendations.push(`Moderate fit - requires training in key areas but has potential`);
    } else {
      overallFit = 'poor';
      recommendations.push(`Consider only if willing to invest in significant training`);
    }
    
    return {
      keyHighlights: highlights.slice(0, 6),
      weaknesses: weaknesses.slice(0, 4),
      overallFit,
      recommendations: recommendations.slice(0, 3),
      skillGapAnalysis: {
        matched: skillsMatch.matched.slice(0, 10),
        missing: skillsMatch.missing.slice(0, 5),
        additional: skillsMatch.additional.slice(0, 5),
        matchPercentage: skillsMatch.matchPercentage
      }
    };
  }

  /**
   * Calculate overall match score
   */
  calculateMatchScore(skillsMatch, experienceMatch, semanticScore = 0) {
    const weights = {
      skills: 0.5,
      experience: 0.3,
      semantic: 0.2
    };
    
    const skillScore = skillsMatch.matchPercentage;
    const expScore = experienceMatch.score;
    
    const matchScore = 
      (skillScore * weights.skills) +
      (expScore * weights.experience) +
      (semanticScore * weights.semantic);
    
    return Math.round(matchScore);
  }

  /**
   * Main method to analyze a candidate for a job - Enhanced with detailed metrics
   */
  async analyzeCandidate(candidate, jobPosting) {
    try {
      // Build candidate profile text for semantic analysis
      const candidateProfile = `
        ${candidate.firstName} ${candidate.lastName}
        Experience: ${candidate.experience?.years || 0} years ${candidate.experience?.months || 0} months
        Current Role: ${candidate.currentDesignation || ''}
        Skills: ${candidate.skills?.join(', ') || ''}
        Education: ${candidate.education?.map(e => `${e.degree} in ${e.specialization}`).join(', ') || ''}
        Company: ${candidate.currentCompany || ''}
      `.trim();
      
      const jobDescription = `
        ${jobPosting.title}
        ${jobPosting.description}
        Required Skills: ${jobPosting.skills?.join(', ') || ''}
        Requirements: ${jobPosting.requirements?.join(', ') || ''}
        Department: ${jobPosting.department?.name || ''}
      `.trim();
      
      // Perform detailed analyses
      const skillsMatch = this.analyzeSkillsMatch(jobPosting.skills, candidate.skills);
      const experienceMatch = this.analyzeExperienceMatch(jobPosting.experience, candidate.experience);
      
      // Calculate semantic similarity (if AI API is available)
      let semanticScore = 0;
      try {
        semanticScore = await this.calculateSemanticSimilarity(jobDescription, candidateProfile);
      } catch (error) {
        console.log('Semantic analysis not available, using keyword-based matching');
      }
      
      // Generate AI insights
      const insights = await this.generateAIInsights(jobPosting, candidate, skillsMatch, experienceMatch);
      
      // Calculate overall match score
      const matchScore = this.calculateMatchScore(skillsMatch, experienceMatch, semanticScore);
      
      // Extract detailed resume insights
      const resumeInsights = {
        totalExperience: `${candidate.experience?.years || 0}y ${candidate.experience?.months || 0}m`,
        keySkills: candidate.skills?.slice(0, 15) || [],
        education: candidate.education?.map(e => `${e.degree} - ${e.specialization}`) || [],
        certifications: candidate.certifications || [],
        currentCompany: candidate.currentCompany || 'Not specified',
        currentDesignation: candidate.currentDesignation || 'Not specified'
      };
      
      // Calculate fit indicators
      const fitIndicators = {
        skillFit: skillsMatch.matchPercentage,
        experienceFit: experienceMatch.score,
        semanticFit: semanticScore,
        overallFit: matchScore
      };
      
      // Risk assessment
      const riskFactors = [];
      if (skillsMatch.matchPercentage < 50) {
        riskFactors.push('High skill gap - requires significant training');
      }
      if (experienceMatch.score < 50) {
        riskFactors.push('Experience level may not match role requirements');
      }
      if (candidate.experience?.years === 0) {
        riskFactors.push('Fresh graduate - may need extensive mentoring');
      }
      
      // Opportunity indicators
      const opportunities = [];
      if (skillsMatch.additional && skillsMatch.additional.length > 0) {
        opportunities.push(`Candidate has bonus skills: ${skillsMatch.additional.slice(0, 3).join(', ')}`);
      }
      if (experienceMatch.score > 100) {
        opportunities.push('Candidate is overqualified - could be a senior contributor');
      }
      if (candidate.education && candidate.education.length > 1) {
        opportunities.push('Diverse educational background - brings multiple perspectives');
      }
      
      return {
        matchScore,
        analysisDate: new Date(),
        skillsMatch,
        experienceMatch,
        keyHighlights: insights.keyHighlights,
        weaknesses: insights.weaknesses,
        recommendations: insights.recommendations || [],
        overallFit: insights.overallFit,
        skillGapAnalysis: insights.skillGapAnalysis,
        resumeInsights,
        fitIndicators,
        riskFactors: riskFactors.slice(0, 3),
        opportunities: opportunities.slice(0, 3),
        semanticScore,
        isAnalyzed: true
      };
    } catch (error) {
      console.error('Error analyzing candidate:', error);
      throw error;
    }
  }

  /**
   * Batch analyze multiple candidates
   */
  async analyzeCandidatesBatch(candidates, jobPosting, options = {}) {
    const { concurrency = 3 } = options;
    const results = [];
    
    // Process in batches to avoid rate limits
    for (let i = 0; i < candidates.length; i += concurrency) {
      const batch = candidates.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(candidate => this.analyzeCandidate(candidate, jobPosting))
      );
      
      results.push(...batchResults);
      
      // Small delay between batches to avoid rate limiting
      if (i + concurrency < candidates.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  /**
   * AI-powered Resume Search and Shortlisting
   * Implements the exact prompt specification provided by Vaibhav Papa Jee
   */
  async screenAndShortlistResumes(candidates, requirements) {
    const {
      requiredSkills = [],
      preferredSkills = [],
      minimumExperience = 0,
      maxResults = 10
    } = requirements;

    try {
      // Build the system prompt as specified
      const systemPrompt = `You are an HR resume-screening assistant. 
You will receive multiple resumes in raw text form.

Your task:
1. Read every resume.
2. Identify primary skills, secondary skills, total experience in years, location, and current/previous roles.
3. Match them against the required skills I will provide.
4. Calculate a match score based on number of matched skills.
5. Rank all resumes from highest to lowest match score.
6. Provide a shortlist with a clear explanation for each shortlisted candidate:
   - matched skills
   - years of experience
   - why this candidate is relevant
7. Return response in JSON format:
[
  {
    "name": "",
    "matchedSkills": [],
    "score": 0,
    "experience": "",
    "location": "",
    "summary": ""
  }
]

Filter Logic:
Only shortlist candidates who contain ALL mandatory skills if specified.
Otherwise, shortlist top candidates based on score.`;

      // Prepare candidate data for AI analysis
      const candidateResumes = candidates.map(candidate => ({
        id: candidate._id,
        name: `${candidate.firstName} ${candidate.lastName}`,
        resumeText: candidate.resumeText || this.generateResumeText(candidate),
        email: candidate.email,
        phone: candidate.phone,
        skills: candidate.skills || [],
        experience: candidate.experience || { years: 0, months: 0 },
        currentCompany: candidate.currentCompany || '',
        currentDesignation: candidate.currentDesignation || '',
        education: candidate.education || []
      }));

      // Build the user prompt with requirements and candidate data
      const userPrompt = `RequiredSkills: ${JSON.stringify(requiredSkills)}
PreferredSkills: ${JSON.stringify(preferredSkills)}
MinimumExperience: ${minimumExperience} years

Candidate Resumes:
${candidateResumes.map((candidate, index) => `
Candidate ${index + 1}:
Name: ${candidate.name}
Email: ${candidate.email}
Phone: ${candidate.phone}
Current Company: ${candidate.currentCompany}
Current Role: ${candidate.currentDesignation}
Total Experience: ${candidate.experience.years} years ${candidate.experience.months} months
Skills: ${candidate.skills.join(', ')}
Education: ${candidate.education.map(e => `${e.degree} in ${e.specialization}`).join(', ')}

Resume Text:
${candidate.resumeText}
`).join('\n---\n')}

Please analyze these resumes and provide the shortlisting in the exact JSON format specified.`;

      // Call AI API for resume screening
      const aiResponse = await this.callAIForResumeScreening(systemPrompt, userPrompt);
      
      // Parse and validate the AI response
      const shortlistedCandidates = this.parseResumeScreeningResponse(aiResponse, candidateResumes);
      
      // Apply additional filtering and ranking
      const filteredResults = this.applyFilteringLogic(shortlistedCandidates, {
        requiredSkills,
        minimumExperience,
        maxResults
      });

      return filteredResults;

    } catch (error) {
      console.error('Error in resume screening and shortlisting:', error);
      // Fallback to rule-based screening if AI fails
      return this.fallbackResumeScreening(candidates, requirements);
    }
  }

  /**
   * Generate resume text from candidate data when resume text is not available
   */
  generateResumeText(candidate) {
    return `
Professional Profile:
Name: ${candidate.firstName} ${candidate.lastName}
Email: ${candidate.email}
Phone: ${candidate.phone}

Current Position: ${candidate.currentDesignation || 'Not specified'}
Company: ${candidate.currentCompany || 'Not specified'}
Total Experience: ${candidate.experience?.years || 0} years ${candidate.experience?.months || 0} months

Technical Skills:
${(candidate.skills || []).join(', ')}

Education:
${(candidate.education || []).map(e => `- ${e.degree} in ${e.specialization}`).join('\n')}
    `.trim();
  }

  /**
   * Call AI API for resume screening
   */
  async callAIForResumeScreening(systemPrompt, userPrompt) {
    try {
      if (this.useGemini) {
        return await this.callGeminiAPI(systemPrompt, userPrompt);
      } else if (this.useDeepSeek) {
        return await this.callDeepSeekAPI(systemPrompt, userPrompt);
      } else if (this.useOpenAI) {
        return await this.callOpenAIAPI(systemPrompt, userPrompt);
      } else {
        throw new Error('No AI API configured');
      }
    } catch (error) {
      console.error('AI API call failed:', error);
      throw error;
    }
  }

  /**
   * Call Gemini API for resume screening
   */
  async callGeminiAPI(systemPrompt, userPrompt) {
    const response = await axios.post(
      `${this.geminiBaseURL}/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`,
      {
        contents: [
          {
            parts: [
              {
                text: `${systemPrompt}\n\n${userPrompt}`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3, // Lower temperature for more consistent results
          maxOutputTokens: 4000
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.candidates[0]?.content?.parts[0]?.text?.trim();
    if (!content) {
      throw new Error('No content received from Gemini API');
    }

    return content;
  }

  /**
   * Call DeepSeek API for resume screening
   */
  async callDeepSeekAPI(systemPrompt, userPrompt) {
    const response = await axios.post(
      `${this.baseURL}/chat/completions`,
      {
        model: this.deepseekModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3, // Lower temperature for more consistent results
        max_tokens: 4000
      },
      {
        headers: {
          'Authorization': `Bearer ${this.deepseekApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content;
  }

  /**
   * Call OpenAI API for resume screening (fallback)
   */
  async callOpenAIAPI(systemPrompt, userPrompt) {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: this.openaiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 4000
      },
      {
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content;
  }

  /**
   * Parse AI response for resume screening
   */
  parseResumeScreeningResponse(aiResponse, candidateResumes) {
    try {
      // Clean the response to extract JSON
      let cleanResponse = aiResponse.trim();
      
      // Remove markdown code blocks if present
      cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      // Extract JSON array using regex
      const jsonMatch = cleanResponse.match(/\[.*?\]/s);
      if (!jsonMatch) {
        throw new Error('No JSON array found in AI response');
      }
      
      const parsedResponse = JSON.parse(jsonMatch[0]);
      
      // Validate and enhance the response
      return parsedResponse.map((candidate, index) => {
        const originalCandidate = candidateResumes.find(c => 
          c.name.toLowerCase().includes(candidate.name?.toLowerCase() || '') ||
          candidate.name?.toLowerCase().includes(c.name.toLowerCase())
        );
        
        return {
          candidateId: originalCandidate?.id || null,
          name: candidate.name || 'Unknown',
          email: originalCandidate?.email || '',
          phone: originalCandidate?.phone || '',
          matchedSkills: candidate.matchedSkills || [],
          score: Math.max(0, Math.min(100, parseInt(candidate.score) || 0)),
          experience: candidate.experience || 'Not specified',
          location: candidate.location || 'Not specified',
          summary: candidate.summary || 'No summary provided',
          currentCompany: originalCandidate?.currentCompany || '',
          currentDesignation: originalCandidate?.currentDesignation || '',
          allSkills: originalCandidate?.skills || []
        };
      });
      
    } catch (error) {
      console.error('Error parsing AI response:', error);
      throw new Error('Failed to parse AI response for resume screening');
    }
  }

  /**
   * Apply filtering logic as specified in the requirements
   */
  applyFilteringLogic(shortlistedCandidates, requirements) {
    const { requiredSkills, minimumExperience, maxResults } = requirements;
    
    let filteredCandidates = [...shortlistedCandidates];
    
    // Filter 1: Must contain ALL mandatory skills if specified
    if (requiredSkills && requiredSkills.length > 0) {
      filteredCandidates = filteredCandidates.filter(candidate => {
        const candidateSkills = candidate.matchedSkills.map(s => s.toLowerCase());
        const mandatorySkills = requiredSkills.map(s => s.toLowerCase());
        
        return mandatorySkills.every(skill => 
          candidateSkills.some(candidateSkill => 
            candidateSkill.includes(skill) || skill.includes(candidateSkill)
          )
        );
      });
    }
    
    // Filter 2: Minimum experience requirement
    if (minimumExperience > 0) {
      filteredCandidates = filteredCandidates.filter(candidate => {
        const expMatch = candidate.experience.match(/(\d+)\s*(?:years?|y)/i);
        const candidateYears = expMatch ? parseInt(expMatch[1]) : 0;
        return candidateYears >= minimumExperience;
      });
    }
    
    // Sort by score (highest first)
    filteredCandidates.sort((a, b) => b.score - a.score);
    
    // Limit results
    return filteredCandidates.slice(0, maxResults);
  }

  /**
   * Fallback rule-based resume screening when AI fails
   */
  fallbackResumeScreening(candidates, requirements) {
    const { requiredSkills = [], preferredSkills = [], minimumExperience = 0, maxResults = 10 } = requirements;
    
    const scoredCandidates = candidates.map(candidate => {
      const candidateSkills = candidate.skills || [];
      const candidateYears = (candidate.experience?.years || 0) + (candidate.experience?.months || 0) / 12;
      
      // Calculate skill match score
      const requiredMatches = requiredSkills.filter(skill => 
        candidateSkills.some(cs => cs.toLowerCase().includes(skill.toLowerCase()))
      ).length;
      
      const preferredMatches = preferredSkills.filter(skill => 
        candidateSkills.some(cs => cs.toLowerCase().includes(skill.toLowerCase()))
      ).length;
      
      // Calculate score (70% for required skills, 20% for preferred, 10% for experience)
      const requiredScore = requiredSkills.length > 0 ? (requiredMatches / requiredSkills.length) * 70 : 70;
      const preferredScore = preferredSkills.length > 0 ? (preferredMatches / preferredSkills.length) * 20 : 20;
      const experienceScore = candidateYears >= minimumExperience ? 10 : Math.max(0, 10 - (minimumExperience - candidateYears) * 2);
      
      const totalScore = Math.round(requiredScore + preferredScore + experienceScore);
      
      // Get matched skills
      const matchedSkills = [
        ...requiredSkills.filter(skill => 
          candidateSkills.some(cs => cs.toLowerCase().includes(skill.toLowerCase()))
        ),
        ...preferredSkills.filter(skill => 
          candidateSkills.some(cs => cs.toLowerCase().includes(skill.toLowerCase()))
        )
      ];
      
      return {
        candidateId: candidate._id,
        name: `${candidate.firstName} ${candidate.lastName}`,
        email: candidate.email,
        phone: candidate.phone,
        matchedSkills,
        score: totalScore,
        experience: `${candidateYears} years`,
        location: 'Not specified',
        summary: `Candidate with ${candidateYears} years of experience. Matched ${matchedSkills.length} relevant skills.`,
        currentCompany: candidate.currentCompany || '',
        currentDesignation: candidate.currentDesignation || '',
        allSkills: candidateSkills
      };
    });
    
    // Apply filters and sort
    let filtered = scoredCandidates;
    
    // Filter by mandatory skills
    if (requiredSkills.length > 0) {
      filtered = filtered.filter(candidate => {
        const candidateSkills = candidate.matchedSkills.map(s => s.toLowerCase());
        return requiredSkills.every(skill => 
          candidateSkills.some(cs => cs.includes(skill.toLowerCase()))
        );
      });
    }
    
    // Filter by experience
    filtered = filtered.filter(candidate => {
      const expMatch = candidate.experience.match(/(\d+)/);
      return expMatch ? parseInt(expMatch[1]) >= minimumExperience : false;
    });
    
    // Sort and limit
    return filtered
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }
}

module.exports = new AIService();
