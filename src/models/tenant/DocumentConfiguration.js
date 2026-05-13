/**
 * Document Configuration Model
 * Configurable document requirements for onboarding
 */

const mongoose = require('mongoose');

const documentConfigurationSchema = new mongoose.Schema({
  // Document type configuration
  documentType: {
    type: String,
    required: true,
    unique: true,
    enum: [
      'educational_certificate',
      'aadhaar_card',
      'pan_card',
      'experience_letter',
      'resume',
      'photograph',
      'address_proof',
      'bank_details',
      'passport',
      'training_certificate',
      'other'
    ]
  },
  
  displayName: {
    type: String,
    required: true
  },
  
  description: {
    type: String
  },
  
  // Requirements
  isMandatory: {
    type: Boolean,
    default: true
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  // File validation rules
  allowedFormats: [{
    type: String,
    enum: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx']
  }],
  
  maxFileSizeMB: {
    type: Number,
    default: 5
  },
  
  // Upload instructions
  uploadInstructions: {
    type: String
  },
  
  // Verification guidelines for HR
  verificationGuidelines: {
    type: String
  },
  
  // Display order
  displayOrder: {
    type: Number,
    default: 0
  },
  
  // Category
  category: {
    type: String,
    enum: ['identity', 'education', 'employment', 'financial', 'other'],
    default: 'other'
  }
}, {
  timestamps: true
});

// Default document configurations
documentConfigurationSchema.statics.getDefaultConfigurations = function() {
  return [
    {
      documentType: 'educational_certificate',
      displayName: 'Educational/Qualification Certificates',
      description: 'All educational certificates (10th, 12th, Graduation, Post-Graduation, etc.)',
      isMandatory: true,
      allowedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
      maxFileSizeMB: 10,
      uploadInstructions: 'Please upload clear scanned copies of all your educational certificates. Multiple certificates can be combined into a single PDF.',
      verificationGuidelines: 'Verify institution name, degree, marks/grade, and year of completion.',
      displayOrder: 1,
      category: 'education'
    },
    {
      documentType: 'aadhaar_card',
      displayName: 'Aadhaar Card',
      description: 'Government-issued Aadhaar card (both sides)',
      isMandatory: true,
      allowedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
      maxFileSizeMB: 5,
      uploadInstructions: 'Upload both front and back of your Aadhaar card. Ensure the Aadhaar number is clearly visible.',
      verificationGuidelines: 'Verify name matches with other documents, check Aadhaar number visibility.',
      displayOrder: 2,
      category: 'identity'
    },
    {
      documentType: 'pan_card',
      displayName: 'PAN Card',
      description: 'Permanent Account Number card',
      isMandatory: true,
      allowedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
      maxFileSizeMB: 5,
      uploadInstructions: 'Upload a clear copy of your PAN card. Ensure PAN number and name are clearly visible.',
      verificationGuidelines: 'Verify PAN number format, name matches with other documents.',
      displayOrder: 3,
      category: 'identity'
    },
    {
      documentType: 'experience_letter',
      displayName: 'Previous Employment Experience Letter(s)',
      description: 'Experience/Relieving letters from previous employers',
      isMandatory: false,
      allowedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
      maxFileSizeMB: 10,
      uploadInstructions: 'Upload experience letters from all previous employers. If fresher, you may skip this.',
      verificationGuidelines: 'Verify company name, designation, duration, and authenticity.',
      displayOrder: 4,
      category: 'employment'
    },
    {
      documentType: 'resume',
      displayName: 'Latest Resume',
      description: 'Your most recent updated resume',
      isMandatory: true,
      allowedFormats: ['pdf', 'doc', 'docx'],
      maxFileSizeMB: 5,
      uploadInstructions: 'Upload your latest resume in PDF or Word format.',
      verificationGuidelines: 'Verify experience matches with offer, check for consistency.',
      displayOrder: 5,
      category: 'employment'
    },
    {
      documentType: 'photograph',
      displayName: 'Passport-size Photograph',
      description: 'Recent passport-size photograph',
      isMandatory: true,
      allowedFormats: ['jpg', 'jpeg', 'png'],
      maxFileSizeMB: 2,
      uploadInstructions: 'Upload a recent passport-size photograph with white background.',
      verificationGuidelines: 'Verify photo quality and professionalism.',
      displayOrder: 6,
      category: 'identity'
    },
    {
      documentType: 'address_proof',
      displayName: 'Address Proof',
      description: 'Utility bill, bank statement, or rental agreement',
      isMandatory: true,
      allowedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
      maxFileSizeMB: 5,
      uploadInstructions: 'Upload any valid address proof (utility bill, bank statement, rental agreement not older than 3 months).',
      verificationGuidelines: 'Verify address matches with Aadhaar, check document date.',
      displayOrder: 7,
      category: 'identity'
    },
    {
      documentType: 'bank_details',
      displayName: 'Bank Account Details',
      description: 'Cancelled cheque or bank passbook',
      isMandatory: true,
      allowedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
      maxFileSizeMB: 5,
      uploadInstructions: 'Upload a cancelled cheque or bank passbook first page showing account details.',
      verificationGuidelines: 'Verify account holder name, account number, IFSC code are clearly visible.',
      displayOrder: 8,
      category: 'financial'
    },
    {
      documentType: 'passport',
      displayName: 'Passport',
      description: 'Valid passport (if available)',
      isMandatory: false,
      allowedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
      maxFileSizeMB: 5,
      uploadInstructions: 'Upload first and last page of your passport. Optional if not available.',
      verificationGuidelines: 'Verify passport number, validity, and name matches.',
      displayOrder: 9,
      category: 'identity'
    },
    {
      documentType: 'training_certificate',
      displayName: 'Training / Course Certificates',
      description: 'Certificates from trainings, workshops, online courses, or professional programs.',
      isMandatory: false,
      allowedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
      maxFileSizeMB: 10,
      uploadInstructions: 'Upload any relevant training or course completion certificates. You can upload multiple certificates for this section.',
      verificationGuidelines: 'Verify training provider, course name, and completion date.',
      displayOrder: 10,
      category: 'education'
    },
    {
      documentType: 'other',
      displayName: 'Other Supporting Documents / Certificates',
      description: 'Any additional certificates or documents you want to share (awards, memberships, etc.).',
      isMandatory: false,
      allowedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
      maxFileSizeMB: 10,
      uploadInstructions: 'Upload any other relevant documents or certificates. You can upload multiple documents for this section.',
      verificationGuidelines: 'Check that the document is readable and relevant to the candidate profile.',
      displayOrder: 11,
      category: 'other'
    }
  ];
};

documentConfigurationSchema.index({ documentType: 1 });
documentConfigurationSchema.index({ isActive: 1, displayOrder: 1 });

module.exports = documentConfigurationSchema;
