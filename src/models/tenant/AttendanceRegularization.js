const mongoose = require('mongoose');

const attendanceRegularizationSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  requestedAttendance: {
    checkIn: {
      type: Date,
      required: true
    },
    checkOut: {
      type: Date
    },
    status: {
      type: String,
      enum: ['present', 'half-day', 'absent'],
      default: 'present'
    },
    workingHours: {
      type: Number
    }
  },
  currentAttendance: {
    checkIn: Date,
    checkOut: Date,
    status: String,
    workingHours: Number
  },
  reason: {
    type: String,
    required: true,
    minlength: 10,
    maxlength: 500
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending'
  },
  approvalDate: {
    type: Date
  },
  rejectionReason: {
    type: String
  },
  daysDifference: {
    type: Number,
    required: true
  },
  attachments: [{
    fileName: String,
    fileUrl: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  metadata: {
    ipAddress: String,
    userAgent: String,
    geolocation: {
      latitude: Number,
      longitude: Number
    }
  }
}, {
  timestamps: true
});

// Indexes
attendanceRegularizationSchema.index({ employeeId: 1, date: -1 });
attendanceRegularizationSchema.index({ status: 1, createdAt: -1 });
attendanceRegularizationSchema.index({ approvedBy: 1, status: 1 });

// Calculate days difference before saving
attendanceRegularizationSchema.pre('save', function(next) {
  if (this.isNew) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const requestDate = new Date(this.date);
    requestDate.setHours(0, 0, 0, 0);
    
    this.daysDifference = Math.floor((today - requestDate) / (1000 * 60 * 60 * 24));
  }
  next();
});

module.exports = attendanceRegularizationSchema;
