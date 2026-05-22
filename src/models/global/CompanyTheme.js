/**
 * Company Theme Model - Stored in hrms_global database
 * Stores custom branding for each company's login page
 */

const mongoose = require('mongoose');

const companyThemeSchema = new mongoose.Schema({
  companyId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Logo
  logo: {
    url: String,
    fileName: String,
    uploadedAt: Date
  },
  // Background image
  backgroundImage: {
    url: String,
    fileName: String,
    uploadedAt: Date
  },
  // Color scheme
  colors: {
    primary: {
      type: String,
      default: '#5C6FE0'
    },
    secondary: {
      type: String,
      default: '#5C6370'
    },
    accent: {
      type: String,
      default: '#5C6FE0'
    },
    background: {
      type: String,
      default: '#13141A'
    },
    text: {
      type: String,
      default: '#EDEDEF'
    },
    cardBackground: {
      type: String,
      default: '#1A1B22'
    }
  },
  // Typography
  typography: {
    fontFamily: {
      type: String,
      default: 'Inter, system-ui, sans-serif'
    },
    fontSize: {
      type: String,
      default: 'medium',
      enum: ['small', 'medium', 'large']
    }
  },
  // Login page customization
  loginPage: {
    welcomeMessage: {
      type: String,
      default: 'Welcome Back'
    },
    subtitle: {
      type: String,
      default: 'Sign in to your account'
    },
    showCompanyName: {
      type: Boolean,
      default: true
    },
    showLogo: {
      type: Boolean,
      default: true
    },
    showBackgroundImage: {
      type: Boolean,
      default: true
    }
  },
  // Dashboard customization
  dashboard: {
    layout: {
      type: String,
      default: 'modern',
      enum: ['classic', 'modern', 'minimal']
    },
    sidebarStyle: {
      type: String,
      default: 'dark',
      enum: ['light', 'dark', 'colored']
    }
  },
  // Custom CSS (advanced)
  customCSS: {
    type: String,
    maxlength: 10000
  },
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  lastUpdatedBy: {
    type: String // userId from tenant database
  }
}, {
  timestamps: true
});

module.exports = companyThemeSchema;
