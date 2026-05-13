/**
 * Candidate Bulk Upload Template
 * Defines the required and optional fields for bulk candidate upload
 */

const candidateBulkUploadTemplate = {
  // Required fields
  requiredFields: [
    'firstName',
    'lastName',
    'email',
    'phone',
    'appliedFor' // Job Title or Job ID
  ],
  
  // Optional fields
  optionalFields: [
    'alternatePhone',
    'currentLocation',
    'preferredLocation', // Comma-separated
    'source', // internal, linkedin, naukri, referral, job-portal, walk-in, other
    'experienceYears',
    'experienceMonths',
    'currentCompany',
    'currentDesignation',
    'currentCTC',
    'expectedCTC',
    'noticePeriod',
    'skills', // Comma-separated
    'stage', // applied, screening, shortlisted, etc.
    'notes'
  ],
  
  // Field validation rules
  fieldRules: {
    firstName: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 50,
      pattern: /^[a-zA-Z\s'-]+$/
    },
    lastName: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 50,
      pattern: /^[a-zA-Z\s'-]+$/
    },
    email: {
      type: 'string',
      required: true,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    phone: {
      type: 'string',
      required: true,
      pattern: /^[\d\s\-\+\(\)]+$/
    },
    alternatePhone: {
      type: 'string',
      required: false,
      pattern: /^[\d\s\-\+\(\)]*$/
    },
    source: {
      type: 'string',
      required: false,
      enum: ['internal', 'linkedin', 'naukri', 'referral', 'job-portal', 'walk-in', 'other'],
      default: 'other'
    },
    experienceYears: {
      type: 'number',
      required: false,
      min: 0,
      max: 50
    },
    experienceMonths: {
      type: 'number',
      required: false,
      min: 0,
      max: 11
    },
    currentCTC: {
      type: 'number',
      required: false,
      min: 0
    },
    expectedCTC: {
      type: 'number',
      required: false,
      min: 0
    },
    noticePeriod: {
      type: 'number',
      required: false,
      min: 0,
      max: 90
    },
    stage: {
      type: 'string',
      required: false,
      enum: ['applied', 'screening', 'shortlisted', 'interview-scheduled', 
             'interview-completed', 'offer-extended', 'offer-accepted', 
             'offer-rejected', 'sent-to-onboarding', 'joined', 'rejected'],
      default: 'applied'
    }
  },
  
  // Expected column headers (case-insensitive)
  expectedHeaders: [
    'firstName', 'first name', 'first_name',
    'lastName', 'last name', 'last_name',
    'email', 'e-mail',
    'phone', 'mobile', 'phone number', 'phone_number',
    'alternatePhone', 'alternate phone', 'alternate_phone', 'alt phone',
    'currentLocation', 'current location', 'current_location', 'location',
    'preferredLocation', 'preferred location', 'preferred_location',
    'source',
    'appliedFor', 'applied for', 'applied_for', 'job', 'job title', 'job_title',
    'experienceYears', 'experience years', 'experience_years', 'years of experience',
    'experienceMonths', 'experience months', 'experience_months',
    'currentCompany', 'current company', 'current_company', 'company',
    'currentDesignation', 'current designation', 'current_designation', 'designation',
    'currentCTC', 'current ctc', 'current_ctc', 'current salary',
    'expectedCTC', 'expected ctc', 'expected_ctc', 'expected salary',
    'noticePeriod', 'notice period', 'notice_period',
    'skills', 'skill',
    'stage', 'status',
    'notes', 'note', 'comments'
  ],
  
  // Header mapping (normalize various header formats)
  headerMapping: {
    // CamelCase headers from template
    'firstName': 'firstName',
    'lastName': 'lastName',
    'email': 'email',
    'phone': 'phone',
    'appliedFor': 'appliedFor',
    'alternatePhone': 'alternatePhone',
    'currentLocation': 'currentLocation',
    'preferredLocation': 'preferredLocation',
    'source': 'source',
    'experienceYears': 'experienceYears',
    'experienceMonths': 'experienceMonths',
    'currentCompany': 'currentCompany',
    'currentDesignation': 'currentDesignation',
    'currentCTC': 'currentCTC',
    'expectedCTC': 'expectedCTC',
    'noticePeriod': 'noticePeriod',
    'skills': 'skills',
    'stage': 'stage',
    'notes': 'notes',
    // Alternative formats
    'first name': 'firstName',
    'first_name': 'firstName',
    'last name': 'lastName',
    'last_name': 'lastName',
    'e-mail': 'email',
    'mobile': 'phone',
    'phone number': 'phone',
    'phone_number': 'phone',
    'alternate phone': 'alternatePhone',
    'alternate_phone': 'alternatePhone',
    'alt phone': 'alternatePhone',
    'current location': 'currentLocation',
    'current_location': 'currentLocation',
    'location': 'currentLocation',
    'preferred location': 'preferredLocation',
    'preferred_location': 'preferredLocation',
    'applied for': 'appliedFor',
    'applied_for': 'appliedFor',
    'job': 'appliedFor',
    'job title': 'appliedFor',
    'job_title': 'appliedFor',
    'experience years': 'experienceYears',
    'experience_years': 'experienceYears',
    'years of experience': 'experienceYears',
    'current company': 'currentCompany',
    'current_company': 'currentCompany',
    'company': 'currentCompany',
    'current designation': 'currentDesignation',
    'current_designation': 'currentDesignation',
    'designation': 'currentDesignation',
    'current ctc': 'currentCTC',
    'current_ctc': 'currentCTC',
    'current salary': 'currentCTC',
    'expected ctc': 'expectedCTC',
    'expected_ctc': 'expectedCTC',
    'expected salary': 'expectedCTC',
    'notice period': 'noticePeriod',
    'notice_period': 'noticePeriod',
    'skill': 'skills',
    'status': 'stage',
    'note': 'notes',
    'comments': 'notes'
  }
};

module.exports = candidateBulkUploadTemplate;
