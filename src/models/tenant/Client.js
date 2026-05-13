/**
 * Tenant Client Model - Stored in each tenant database (tenant_{companyId})
 * Contains: Client information for projects
 */

const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Client name is required'],
    trim: true
  },
  companyName: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true
  },
  clientCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required']
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String
  },
  industry: {
    type: String,
    required: true
  },
  website: {
    type: String
  },
  contactPerson: {
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true
    },
    phone: {
      type: String,
      required: true
    },
    designation: String
  },
  billingInfo: {
    billingAddress: {
      street: String,
      city: String,
      state: String,
      country: String,
      postalCode: String
    },
    taxId: String,
    paymentTerms: {
      type: String,
      default: 'NET 30'
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'prospect'],
    default: 'active'
  },
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better performance
clientSchema.index({ clientCode: 1 });
clientSchema.index({ email: 1 });
clientSchema.index({ status: 1 });

module.exports = clientSchema;
