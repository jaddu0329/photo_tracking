const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { generateTrackingId } = require('./trackingService');
const { embedInPixels, extractFromPixels } = require('./watermarkService');

// Ensure processed directory exists
if (!fs.existsSync(config.processedDir)) {
  fs.mkdirSync(config.processedDir, { recursive: true });
}

/**
 * Compute SHA-256 checksum of a file buffer.
 */
const computeChecksum = (buffer) => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

/**
 * Process an uploaded image (Phase 2 – no database):
 *  1. Generate UUID tracking ID
 *  2. Compute checksum of original
 *  3. Embed tracking ID into pixel data (LSB watermark)
 *  4. Save processed image to /processed folder
 *  5. Keep original untouched in /uploads
 *  6. Return tracking ID + processed filename
 */
const processUpload = async (file, uploaderIp) => {
  const trackingId = generateTrackingId();
  const originalBuffer = fs.readFileSync(file.path);
  const checksum = computeChecksum(originalBuffer);

  // ── Embed tracking ID into pixel data (LSB steganography) ──────────
  const embeddedBuffer = await embedInPixels(
    originalBuffer,
    trackingId,
    file.mimetype
  );

  // ── Determine file names ───────────────────────────────────────────
  const ext = path.extname(file.originalname) || '.png';
  const processedFileName = `${trackingId}${ext}`;
  const processedFilePath = path.join(config.processedDir, processedFileName);

  // ── Rename original from temp name to a clean name ─────────────────
  const originalFileName = `original-${Date.now()}${ext}`;
  const originalFilePath = path.join(config.uploadDir, originalFileName);
  fs.renameSync(file.path, originalFilePath);

  // ── Write processed (watermarked) image ────────────────────────────
  fs.writeFileSync(processedFilePath, embeddedBuffer);

  return {
    trackingId,
    originalName: file.originalname,
    originalFileName,
    processedFileName,
    mimeType: file.mimetype,
    originalSize: originalBuffer.length,
    processedSize: embeddedBuffer.length,
    checksum,
    uploaderIp,
  };
};

module.exports = {
  processUpload,
  computeChecksum,
  extractFromPixels,
};
