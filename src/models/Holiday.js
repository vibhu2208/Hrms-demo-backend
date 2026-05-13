const mongoose = require('mongoose');

/**
 * Holiday Model
 * Manages company holidays and observances
 * @module models/Holiday
 */
const holidaySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Holiday name is required'],
    trim: true
  },
  date: {
    type: Date,
    required: [true, 'Holiday date is required']
  },
  type: {
    type: String,
    enum: ['public', 'optional', 'restricted', 'company'],
    default: 'public'
  },
  description: {
    type: String,
    trim: true
  },
  applicableTo: {
    type: String,
    enum: ['all', 'specific-departments', 'specific-locations'],
    default: 'all'
  },
  departments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  }],
  locations: [String],
  isRecurring: {
    type: Boolean,
    default: false
  },
  year: {
    type: Number,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for faster queries
holidaySchema.index({ date: 1, year: 1 });
holidaySchema.index({ year: 1, isActive: 1 });

module.exports = mongoose.model('Holiday', holidaySchema);
