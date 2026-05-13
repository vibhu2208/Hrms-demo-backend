const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
  assetCode: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: [true, 'Asset name is required']
  },
  category: {
    type: String,
    enum: ['laptop', 'desktop', 'mobile', 'tablet', 'monitor', 'keyboard', 'mouse', 'other'],
    required: true
  },
  brand: {
    type: String
  },
  model: {
    type: String
  },
  serialNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  purchaseDate: {
    type: Date
  },
  purchasePrice: {
    type: Number
  },
  warrantyExpiry: {
    type: Date
  },
  status: {
    type: String,
    enum: ['available', 'assigned', 'maintenance', 'retired'],
    default: 'available'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  assignedDate: {
    type: Date
  },
  returnDate: {
    type: Date
  },
  condition: {
    type: String,
    enum: ['excellent', 'good', 'fair', 'poor'],
    default: 'excellent'
  },
  notes: {
    type: String
  },
  history: [{
    action: {
      type: String,
      enum: ['assigned', 'returned', 'maintenance', 'retired']
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    date: {
      type: Date,
      default: Date.now
    },
    notes: String
  }]
}, {
  timestamps: true
});

// Generate asset code before saving
assetSchema.pre('save', async function(next) {
  if (!this.assetCode) {
    const count = await mongoose.model('Asset').countDocuments();
    this.assetCode = `AST${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Asset', assetSchema);
