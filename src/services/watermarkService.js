const sharp = require('sharp');

/**
 * ─── LSB Steganography Watermark Service ─────────────────────────────
 *
 * Embeds a tracking ID directly into pixel data using Least-Significant-Bit
 * (LSB) modification. This is NOT metadata — it survives EXIF stripping,
 * screenshots, and casual re-encoding.
 *
 * Encoding format:
 *   [8-bit START marker: 0xFF] [16-bit payload length] [payload bits] [8-bit END marker: 0xFE]
 *
 * Each bit of the payload is stored in the LSB of one color channel value
 * (R, G, or B) of sequential pixels.
 */

const START_MARKER = 0xff;
const END_MARKER = 0xfe;

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Convert a string to an array of bits (0 | 1).
 */
const stringToBits = (str) => {
  const bits = [];
  const buf = Buffer.from(str, 'utf-8');
  for (const byte of buf) {
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >> i) & 1);
    }
  }
  return bits;
};

/**
 * Convert a byte (0-255) to 8 bits.
 */
const byteToBits = (byte) => {
  const bits = [];
  for (let i = 7; i >= 0; i--) {
    bits.push((byte >> i) & 1);
  }
  return bits;
};

/**
 * Convert a 16-bit number to 16 bits (big-endian).
 */
const uint16ToBits = (num) => {
  const bits = [];
  for (let i = 15; i >= 0; i--) {
    bits.push((num >> i) & 1);
  }
  return bits;
};

/**
 * Build the full bit stream: START_MARKER + length(16-bit) + payload + END_MARKER
 */
const buildBitStream = (text) => {
  const payloadBits = stringToBits(text);
  const payloadByteLength = Buffer.byteLength(text, 'utf-8');

  return [
    ...byteToBits(START_MARKER),     // 8 bits
    ...uint16ToBits(payloadByteLength), // 16 bits
    ...payloadBits,                  // N bits
    ...byteToBits(END_MARKER),       // 8 bits
  ];
};

// ─── Core Functions ───────────────────────────────────────────────────

/**
 * Embed a tracking ID into the raw pixel data of an image.
 *
 * @param {Buffer} inputBuffer  – Original image file buffer
 * @param {string} trackingId   – The tracking ID string to embed
 * @param {string} mimeType     – Original MIME type (image/jpeg, image/png, etc.)
 * @returns {Promise<Buffer>}   – Processed image buffer with embedded ID
 */
const embedInPixels = async (inputBuffer, trackingId, mimeType) => {
  // 1. Decode image to raw RGBA pixels
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();
  const { width, height } = metadata;

  const rawBuffer = await sharp(inputBuffer)
    .ensureAlpha() // guarantee 4 channels (RGBA)
    .raw()
    .toBuffer();

  // Total usable channels = width * height * 3 (skip alpha channel)
  const totalPixels = width * height;
  const usableChannels = totalPixels * 3; // R, G, B per pixel (skip A)

  // 2. Build bit stream
  const bits = buildBitStream(trackingId);

  if (bits.length > usableChannels) {
    throw new Error(
      `Image too small to embed tracking ID. Need ${bits.length} channels, have ${usableChannels}.`
    );
  }

  // 3. Copy raw buffer and modify LSBs
  const pixels = Buffer.from(rawBuffer); // mutable copy
  let bitIndex = 0;

  for (let px = 0; px < totalPixels && bitIndex < bits.length; px++) {
    const baseOffset = px * 4; // RGBA = 4 bytes per pixel
    // Modify R, G, B channels (indices 0, 1, 2) — skip Alpha (index 3)
    for (let ch = 0; ch < 3 && bitIndex < bits.length; ch++) {
      const offset = baseOffset + ch;
      // Clear LSB and set to our bit
      pixels[offset] = (pixels[offset] & 0xfe) | bits[bitIndex];
      bitIndex++;
    }
  }

  // 4. Re-encode to the original format
  const formatMap = {
    'image/jpeg': 'jpeg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/tiff': 'tiff',
  };
  const format = formatMap[mimeType] || 'png';

  let pipeline = sharp(pixels, {
    raw: { width, height, channels: 4 },
  });

  switch (format) {
    case 'jpeg':
      pipeline = pipeline.removeAlpha().jpeg({ quality: 100 }); // max quality to preserve LSBs
      break;
    case 'png':
      pipeline = pipeline.png({ compressionLevel: 0 }); // lossless
      break;
    case 'webp':
      pipeline = pipeline.webp({ lossless: true });
      break;
    case 'tiff':
      pipeline = pipeline.tiff();
      break;
    default:
      pipeline = pipeline.png({ compressionLevel: 0 });
  }

  return pipeline.toBuffer();
};

/**
 * Extract the tracking ID from a watermarked image.
 * (Useful for future verification / Phase 3)
 *
 * @param {Buffer} imageBuffer – Watermarked image buffer
 * @returns {Promise<string|null>} – Extracted tracking ID or null
 */
const extractFromPixels = async (imageBuffer) => {
  const rawBuffer = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = rawBuffer;
  const totalPixels = info.width * info.height;

  // Read all LSBs from R, G, B channels
  const allBits = [];
  for (let px = 0; px < totalPixels; px++) {
    const baseOffset = px * 4;
    for (let ch = 0; ch < 3; ch++) {
      allBits.push(data[baseOffset + ch] & 1);
    }
  }

  // Look for START_MARKER (0xFF = 11111111)
  const startBits = byteToBits(START_MARKER);
  let match = true;
  for (let i = 0; i < 8; i++) {
    if (allBits[i] !== startBits[i]) {
      match = false;
      break;
    }
  }
  if (!match) return null;

  // Read 16-bit length
  let payloadByteLength = 0;
  for (let i = 0; i < 16; i++) {
    payloadByteLength = (payloadByteLength << 1) | allBits[8 + i];
  }

  if (payloadByteLength <= 0 || payloadByteLength > 1000) return null;

  // Read payload bytes
  const payloadStartBit = 24; // 8 (marker) + 16 (length)
  const payloadBytes = [];
  for (let b = 0; b < payloadByteLength; b++) {
    let byte = 0;
    for (let i = 0; i < 8; i++) {
      byte = (byte << 1) | allBits[payloadStartBit + b * 8 + i];
    }
    payloadBytes.push(byte);
  }

  // Verify END_MARKER
  const endStartBit = payloadStartBit + payloadByteLength * 8;
  const endBits = byteToBits(END_MARKER);
  for (let i = 0; i < 8; i++) {
    if (allBits[endStartBit + i] !== endBits[i]) return null;
  }

  return Buffer.from(payloadBytes).toString('utf-8');
};

module.exports = {
  embedInPixels,
  extractFromPixels,
};
