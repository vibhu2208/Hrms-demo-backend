const mongoose = require('mongoose');

/**
 * Employee Request Model
 * Handles various employee requests like ID card reissue, HR queries, document updates, etc.
 * @module models/EmployeeRequest
 */
const employeeRequestSchema = new mongoose.Schema({
  requestNumber: {
    type: String,
    unique: true,
    required: true
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: [true, 'Employee reference is required']
  },
  requestType: {
    type: String,
    enum: [
      'id-card-reissue',
      'hr-query',
      'bank-update',
      'document-upload',
      'address-change',
      'emergency-contact-update',
      'salary-certificate',
      'experience-letter',
      'noc-request',
      'other'
    ],
    required: [true, 'Request type is required']
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
    maxlength: [200, 'Subject cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  status: {
    type: String,
    enum: ['open', 'in-progress', 'pending-info', 'resolved', 'closed', 'rejected'],
    default: 'open'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedAt: {
    type: Date
  },
  documents: [{
    name: String,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    message: {
      type: String,
      required: true
    },
    isInternal: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  resolution: {
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    resolvedAt: Date,
    resolutionNotes: String
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Generate request number before saving
employeeRequestSchema.pre('save', async function(next) {
  if (!this.requestNumber) {
    const count = await mongoose.model('EmployeeRequest').countDocuments();
    const year = new Date().getFullYear();
    this.requestNumber = `REQ${year}${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Index for faster queries
employeeRequestSchema.index({ employee: 1, status: 1 });
employeeRequestSchema.index({ requestNumber: 1 });
employeeRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('EmployeeRequest', employeeRequestSchema);
