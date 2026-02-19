const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema(
  {
    trackingId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    storedFileName: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    uploadedBy: {
      type: String, // can be user ID or IP for now
      default: 'anonymous',
    },
    uploadIp: {
      type: String,
    },
    checksum: {
      type: String, // SHA-256 of original file
    },
    isEmbedded: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

module.exports = mongoose.model('Image', imageSchema);
