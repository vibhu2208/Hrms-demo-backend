const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  },
  feedbackType: {
    type: String,
    enum: ['mid-project', 'end-project', 'quarterly', 'annual', 'exit'],
    required: true
  },
  feedbackBy: {
    type: String,
    enum: ['client', 'manager', 'peer', 'self'],
    required: true
  },
  reviewPeriod: {
    startDate: Date,
    endDate: Date
  },
  ratings: [{
    category: {
      type: String,
      required: true
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true
    },
    comments: String
  }],
  overallRating: {
    type: Number,
    min: 1,
    max: 5
  },
  strengths: [String],
  areasOfImprovement: [String],
  achievements: [String],
  comments: String,
  recommendations: String,
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'acknowledged', 'disputed'],
    default: 'draft'
  },
  acknowledgedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  acknowledgedAt: Date,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Calculate overall rating before saving
feedbackSchema.pre('save', function(next) {
  if (this.ratings && this.ratings.length > 0) {
    const sum = this.ratings.reduce((acc, r) => acc + r.rating, 0);
    this.overallRating = (sum / this.ratings.length).toFixed(2);
  }
  next();
});

module.exports = mongoose.model('Feedback', feedbackSchema);
