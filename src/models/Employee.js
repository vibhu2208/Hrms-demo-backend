const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  employeeCode: {
    type: String,
    required: true,
    unique: true
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: true
  },
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['', 'male', 'female', 'other'],
    required: false
  },
  bloodGroup: {
    type: String,
    enum: ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    required: false
  },
  maritalStatus: {
    type: String,
    enum: ['', 'single', 'married', 'divorced', 'widowed'],
    required: false
  },
  alternatePhone: String,
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  permanentAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  correspondenceAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: [true, 'Department is required']
  },
  reportingManager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: false
  },
  designation: {
    type: String,
    required: true
  },
  joiningDate: {
    type: Date,
    required: true
  },
  employmentType: {
    type: String,
    enum: ['full-time', 'part-time', 'consultant', 'intern', 'contract-based', 'deliverable-based', 'rate-based', 'hourly-based'],
    default: 'full-time'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'terminated', 'on-leave'],
    default: 'active'
  },
  reportingManager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  salary: {
    basic: String,  // Encrypted
    hra: String,    // Encrypted
    allowances: String,  // Encrypted
    deductions: String,  // Encrypted
    total: String,  // Encrypted
    isEncrypted: {
      type: Boolean,
      default: true
    }
  },
  bankDetails: {
    accountNumber: String,
    bankName: String,
    ifscCode: String,
    accountHolderName: String,
    branch: String
  },
  idDetails: {
    aadhaar: String,
    pan: String,
    passport: {
      number: String,
      issueDate: Date,
      expiryDate: Date
    },
    drivingLicense: String
  },
  education: [{
    degree: String,
    specialization: String,
    institution: String,
    passingYear: Number,
    percentage: Number,
    documentUrl: String,
    verified: {
      type: Boolean,
      default: false
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    verifiedAt: Date
  }],
  experience: [{
    company: String,
    designation: String,
    startDate: Date,
    endDate: Date,
    duration: String,
    responsibilities: String
  }],
  currentProject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  currentClient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  },
  documents: [{
    type: {
      type: String,
      enum: ['resume', 'offer-letter', 'id-proof', 'address-proof', 'education', 'other']
    },
    name: String,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  emergencyContact: {
    name: String,
    relationship: String,
    phone: String
  },
  profileImage: {
    type: String
  }
}, {
  timestamps: true
});

// Pre-save hook to handle enum validation and encrypt salary data
employeeSchema.pre('save', async function(next) {
  // Convert empty strings to undefined for enum fields to avoid validation errors
  if (this.gender === '') this.gender = undefined;
  if (this.bloodGroup === '') this.bloodGroup = undefined;
  if (this.maritalStatus === '') this.maritalStatus = undefined;
  if (this.employmentType === '') this.employmentType = undefined;
  
  const encryptionService = require('../services/encryptionService');
  
  // Only encrypt if encryption is configured and salary exists
  if (!encryptionService.isEncryptionConfigured() || !this.salary) {
    return next();
  }

  // Skip if already encrypted
  if (this.salary.isEncrypted) {
    return next();
  }

  try {
    // Encrypt each salary field
    if (this.salary.basic && !String(this.salary.basic).includes(':')) {
      this.salary.basic = encryptionService.encryptField(this.salary.basic, 'basic');
    }
    if (this.salary.hra && !String(this.salary.hra).includes(':')) {
      this.salary.hra = encryptionService.encryptField(this.salary.hra, 'hra');
    }
    if (this.salary.allowances && !String(this.salary.allowances).includes(':')) {
      this.salary.allowances = encryptionService.encryptField(this.salary.allowances, 'allowances');
    }
    if (this.salary.deductions && !String(this.salary.deductions).includes(':')) {
      this.salary.deductions = encryptionService.encryptField(this.salary.deductions, 'deductions');
    }
    if (this.salary.total && !String(this.salary.total).includes(':')) {
      this.salary.total = encryptionService.encryptField(this.salary.total, 'total');
    }

    this.salary.isEncrypted = true;
  } catch (error) {
    console.error('Error encrypting salary:', error.message);
    // Continue without encryption if key not configured
  }

  next();
});

// Method to decrypt salary for authorized users
employeeSchema.methods.getDecryptedSalary = function(requestingUser) {
  const encryptionService = require('../services/encryptionService');
  
  // Check authorization
  if (!encryptionService.isAuthorizedToViewSalary(requestingUser, this._id)) {
    return {
      basic: encryptionService.maskSalary(),
      hra: encryptionService.maskSalary(),
      allowances: encryptionService.maskSalary(),
      deductions: encryptionService.maskSalary(),
      total: encryptionService.maskSalary()
    };
  }
  
  // Decrypt and return
  if (this.salary && this.salary.isEncrypted) {
    return encryptionService.decryptSalary(this.salary);
  }
  
  return this.salary;
};

const Employee = mongoose.model('Employee', employeeSchema);
Employee.schema = employeeSchema;
module.exports = Employee;
