/**
 * Employment Type Constants
 * Centralized definition of all employment types used across the HRMS system
 */

// Standard employment types used across all models
const EMPLOYMENT_TYPES = [
  'full-time',
  'part-time', 
  'consultant',
  'intern',
  'contract-based',
  'deliverable-based',
  'rate-based',
  'hourly-based'
];

// Employment type display names for UI
const EMPLOYMENT_TYPE_LABELS = {
  'full-time': 'Full Time',
  'part-time': 'Part Time',
  'consultant': 'Consultant',
  'intern': 'Intern',
  'contract-based': 'Contract Based',
  'deliverable-based': 'Deliverable Based',
  'rate-based': 'Rate Based',
  'hourly-based': 'Hourly Based'
};

// Employment type categories for grouping
const EMPLOYMENT_TYPE_CATEGORIES = {
  permanent: ['full-time', 'part-time'],
  contract: ['contract-based', 'deliverable-based', 'rate-based', 'hourly-based'],
  temporary: ['consultant', 'intern']
};

// Employment type validation function
const isValidEmploymentType = (type) => {
  return EMPLOYMENT_TYPES.includes(type);
};

// Get employment type label
const getEmploymentTypeLabel = (type) => {
  return EMPLOYMENT_TYPE_LABELS[type] || type;
};

// Get employment type category
const getEmploymentTypeCategory = (type) => {
  for (const [category, types] of Object.entries(EMPLOYMENT_TYPE_CATEGORIES)) {
    if (types.includes(type)) {
      return category;
    }
  }
  return 'other';
};

// Check if two employment types are compatible for job matching
const areEmploymentTypesCompatible = (jobType, candidateType) => {
  // Exact match is always compatible
  if (jobType === candidateType) {
    return true;
  }
  
  // Contract types are generally compatible with each other
  const jobCategory = getEmploymentTypeCategory(jobType);
  const candidateCategory = getEmploymentTypeCategory(candidateType);
  
  if (jobCategory === 'contract' && candidateCategory === 'contract') {
    return true;
  }
  
  // Consultant can work for any contract-based position
  if (candidateType === 'consultant' && jobCategory === 'contract') {
    return true;
  }
  
  // Contract-based candidates can work as consultants
  if (jobType === 'consultant' && candidateCategory === 'contract') {
    return true;
  }
  
  return false;
};

module.exports = {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPE_CATEGORIES,
  isValidEmploymentType,
  getEmploymentTypeLabel,
  getEmploymentTypeCategory,
  areEmploymentTypesCompatible
};
