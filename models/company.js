const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  website: { type: String, required: true },
  logo: { type: mongoose.Schema.Types.ObjectId }, // Reference to GridFS file ID
  mainPhotos: [{
    fileId: { type: mongoose.Schema.Types.ObjectId }, // Reference to GridFS file ID
    caption: { type: String },
    isVideo: { type: Boolean, default: false }
  }],
  insidePhotos: [{
    fileId: { type: mongoose.Schema.Types.ObjectId }, // Reference to GridFS file ID
    caption: { type: String },
    isVideo: { type: Boolean, default: false }
  }],
  location: { type: String, required: true }, // Store location as a string (e.g., "123 Main St, City")
  developer: { type: String, required: true },
  agent: {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    role: { type: String, required: true }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Company', companySchema);