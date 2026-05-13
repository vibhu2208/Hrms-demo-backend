const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Meeting title is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  meetingDate: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  startDateTime: {
    type: Date,
    required: true
  },
  duration: {
    type: Number,
    default: 30
  },
  meetingType: {
    type: String,
    enum: ['online', 'offline'],
    default: 'online'
  },
  location: {
    type: String,
    trim: true
  },
  meetingLink: {
    type: String,
    trim: true
  },
  attendees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  notes: String,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

meetingSchema.index({ createdBy: 1, startDateTime: 1 });
meetingSchema.index({ startDateTime: 1 });

module.exports = mongoose.model('TeamMeeting', meetingSchema);
