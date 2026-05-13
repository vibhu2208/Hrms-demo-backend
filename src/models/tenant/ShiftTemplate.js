/**
 * Shift Template Model - Stored in tenant database
 * Defines shift patterns and timings
 */

const mongoose = require('mongoose');

const shiftTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Shift name is required'],
    trim: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  startTime: {
    type: String, // Format: "HH:mm" (e.g., "09:00")
    required: [true, 'Start time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format. Use HH:mm']
  },
  endTime: {
    type: String, // Format: "HH:mm" (e.g., "18:00")
    required: [true, 'End time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format. Use HH:mm']
  },
  breakDuration: {
    type: Number, // in minutes
    default: 60,
    min: 0
  },
  breakStartTime: {
    type: String, // Format: "HH:mm"
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format. Use HH:mm']
  },
  isNightShift: {
    type: Boolean,
    default: false
  },
  applicableDays: [{
    type: Number, // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    enum: [0, 1, 2, 3, 4, 5, 6]
  }],
  workHours: {
    type: Number, // Calculated work hours per day
    default: 8
  },
  location: {
    type: String,
    trim: true
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  description: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Calculate work hours before saving
shiftTemplateSchema.pre('save', function(next) {
  if (this.startTime && this.endTime) {
    const [startHour, startMin] = this.startTime.split(':').map(Number);
    const [endHour, endMin] = this.endTime.split(':').map(Number);
    
    let startMinutes = startHour * 60 + startMin;
    let endMinutes = endHour * 60 + endMin;
    
    // Handle night shift (end time is next day)
    if (this.isNightShift && endMinutes < startMinutes) {
      endMinutes += 24 * 60; // Add 24 hours
    }
    
    const totalMinutes = endMinutes - startMinutes - (this.breakDuration || 0);
    this.workHours = (totalMinutes / 60).toFixed(2);
  }
  next();
});

// Indexes
shiftTemplateSchema.index({ code: 1 }, { unique: true });
shiftTemplateSchema.index({ isActive: 1 });
shiftTemplateSchema.index({ location: 1 });

module.exports = shiftTemplateSchema;


