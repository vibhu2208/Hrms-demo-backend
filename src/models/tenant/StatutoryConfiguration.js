/**
 * Statutory Configuration Model - Stored in tenant database
 * Stores company-specific statutory compliance settings
 */

const mongoose = require('mongoose');

const statutoryConfigurationSchema = new mongoose.Schema({
  // PF (Provident Fund) Configuration
  pf: {
    enabled: {
      type: Boolean,
      default: true
    },
    pfNumber: {
      type: String,
      trim: true
    },
    employeeContribution: {
      type: Number,
      default: 12, // 12% of basic salary
      min: 0,
      max: 100
    },
    employerContribution: {
      type: Number,
      default: 12, // 12% of basic salary (3.67% to PF, 8.33% to EPS)
      min: 0,
      max: 100
    },
    pfCeiling: {
      type: Number,
      default: 15000 // Maximum basic salary for PF calculation
    },
    adminCharges: {
      type: Number,
      default: 0.5 // 0.5% of basic salary
    },
    edliCharges: {
      type: Number,
      default: 0.5 // 0.5% of basic salary
    },
    epsContribution: {
      type: Number,
      default: 8.33 // 8.33% to EPS
    },
    epfContribution: {
      type: Number,
      default: 3.67 // 3.67% to EPF
    }
  },

  // ESI (Employee State Insurance) Configuration
  esi: {
    enabled: {
      type: Boolean,
      default: true
    },
    esiNumber: {
      type: String,
      trim: true
    },
    employeeContribution: {
      type: Number,
      default: 0.75, // 0.75% of gross salary
      min: 0,
      max: 100
    },
    employerContribution: {
      type: Number,
      default: 3.25, // 3.25% of gross salary
      min: 0,
      max: 100
    },
    wageLimit: {
      type: Number,
      default: 21000 // ESI applicable if gross salary <= 21,000
    }
  },

  // Professional Tax Configuration
  professionalTax: {
    enabled: {
      type: Boolean,
      default: true
    },
    state: {
      type: String,
      enum: ['Maharashtra', 'Karnataka', 'West Bengal', 'Tamil Nadu', 'Gujarat', 'Andhra Pradesh', 'Telangana', 'Madhya Pradesh', 'Assam', 'Other'],
      required: true
    },
    slabs: [{
      minSalary: {
        type: Number,
        required: true
      },
      maxSalary: {
        type: Number,
        required: true
      },
      taxAmount: {
        type: Number,
        required: true
      }
    }],
    registrationNumber: {
      type: String,
      trim: true
    }
  },

  // TDS (Tax Deducted at Source) Configuration
  tds: {
    enabled: {
      type: Boolean,
      default: true
    },
    tanNumber: {
      type: String,
      trim: true,
      uppercase: true
    },
    financialYear: {
      type: String,
      required: true
    },
    oldRegime: {
      slabs: [{
        minIncome: Number,
        maxIncome: Number,
        taxRate: Number,
        deduction: Number
      }]
    },
    newRegime: {
      slabs: [{
        minIncome: Number,
        maxIncome: Number,
        taxRate: Number
      }]
    },
    standardDeduction: {
      type: Number,
      default: 50000
    },
    surchargeRates: [{
      minIncome: Number,
      maxIncome: Number,
      rate: Number
    }],
    cessPercentage: {
      type: Number,
      default: 4 // 4% health and education cess
    }
  },

  // LWF (Labour Welfare Fund) Configuration
  lwf: {
    enabled: {
      type: Boolean,
      default: false
    },
    state: {
      type: String
    },
    employeeContribution: {
      type: Number,
      default: 0
    },
    employerContribution: {
      type: Number,
      default: 0
    },
    frequency: {
      type: String,
      enum: ['monthly', 'half-yearly', 'yearly'],
      default: 'half-yearly'
    }
  },

  // Company Details
  companyDetails: {
    pan: {
      type: String,
      uppercase: true,
      trim: true
    },
    tan: {
      type: String,
      uppercase: true,
      trim: true
    },
    gstin: {
      type: String,
      uppercase: true,
      trim: true
    },
    cin: {
      type: String,
      uppercase: true,
      trim: true
    },
    registeredAddress: {
      street: String,
      city: String,
      state: String,
      pincode: String,
      country: {
        type: String,
        default: 'India'
      }
    }
  },

  // Compliance Settings
  compliance: {
    pfFilingDay: {
      type: Number,
      default: 15,
      min: 1,
      max: 31
    },
    esiFilingDay: {
      type: Number,
      default: 15,
      min: 1,
      max: 31
    },
    ptFilingDay: {
      type: Number,
      default: 15,
      min: 1,
      max: 31
    },
    tdsFilingQuarter: {
      type: String,
      enum: ['Q1', 'Q2', 'Q3', 'Q4']
    },
    autoCalculate: {
      type: Boolean,
      default: true
    },
    sendReminders: {
      type: Boolean,
      default: true
    }
  },

  // Metadata
  isActive: {
    type: Boolean,
    default: true
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Method to get PF calculation
statutoryConfigurationSchema.methods.calculatePF = function(basicSalary) {
  if (!this.pf.enabled) return { employee: 0, employer: 0, total: 0 };

  const cappedBasic = Math.min(basicSalary, this.pf.pfCeiling);
  
  const employeeContribution = (cappedBasic * this.pf.employeeContribution) / 100;
  const epsContribution = (cappedBasic * this.pf.epsContribution) / 100;
  const epfContribution = (cappedBasic * this.pf.epfContribution) / 100;
  const adminCharges = (cappedBasic * this.pf.adminCharges) / 100;
  const edliCharges = (cappedBasic * this.pf.edliCharges) / 100;
  
  const employerContribution = epsContribution + epfContribution + adminCharges + edliCharges;

  return {
    employee: Math.round(employeeContribution),
    employer: Math.round(employerContribution),
    eps: Math.round(epsContribution),
    epf: Math.round(epfContribution),
    admin: Math.round(adminCharges),
    edli: Math.round(edliCharges),
    total: Math.round(employeeContribution + employerContribution)
  };
};

// Method to get ESI calculation
statutoryConfigurationSchema.methods.calculateESI = function(grossSalary) {
  if (!this.esi.enabled || grossSalary > this.esi.wageLimit) {
    return { employee: 0, employer: 0, total: 0, applicable: false };
  }

  const employeeContribution = (grossSalary * this.esi.employeeContribution) / 100;
  const employerContribution = (grossSalary * this.esi.employerContribution) / 100;

  return {
    employee: Math.round(employeeContribution),
    employer: Math.round(employerContribution),
    total: Math.round(employeeContribution + employerContribution),
    applicable: true
  };
};

// Method to get Professional Tax
statutoryConfigurationSchema.methods.calculateProfessionalTax = function(grossSalary) {
  if (!this.professionalTax.enabled || !this.professionalTax.slabs || this.professionalTax.slabs.length === 0) {
    return 0;
  }

  for (const slab of this.professionalTax.slabs) {
    if (grossSalary >= slab.minSalary && grossSalary <= slab.maxSalary) {
      return slab.taxAmount;
    }
  }

  return 0;
};

module.exports = statutoryConfigurationSchema;
