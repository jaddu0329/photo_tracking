/**
 * ─── Photo Tracking Server – Phase 2 (Standalone Entry Point) ────────
 *
 * Upload flow:
 *   1. User POSTs an image to /upload  (form field: "image")
 *   2. Server generates a UUID tracking ID  (PTK-xxxxxxxx-…)
 *   3. Tracking ID is embedded directly into pixel data using
 *      LSB (Least-Significant-Bit) steganography — NOT just EXIF.
 *      Only the last bit of each R/G/B channel value is flipped,
 *      making the change visually invisible.
 *   4. Original image stays untouched in  /uploads
 *   5. Watermarked copy is saved in        /processed
 *   6. JSON response returns trackingId, original filename,
 *      and processed filename.
 *
 * Required packages (already in package.json):
 *   npm install express multer cors uuid sharp
 *
 * Run:
 *   node index.js
 */

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
const PORT = process.env.PORT || 5000;

// ─── Directories (auto-created if missing) ───────────────────────────
const uploadDir = path.join(__dirname, "uploads");
const processedDir = path.join(__dirname, "processed");

[uploadDir, processedDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── Multer config ───────────────────────────────────────────────────
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/tiff"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `original-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type "${file.mimetype}". Allowed: ${ALLOWED_TYPES.join(", ")}`
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// ═════════════════════════════════════════════════════════════════════
//  LSB Steganography — Invisible Pixel Watermark
// ═════════════════════════════════════════════════════════════════════
//
//  Bit stream layout written into pixel LSBs:
//    [START_MARKER 8 bits] [PAYLOAD_LENGTH 16 bits] [PAYLOAD N×8 bits] [END_MARKER 8 bits]
//
//  Each bit replaces the least-significant bit of one R, G, or B
//  channel value.  Changing a channel value by ±1 out of 255 is
//  imperceptible to the human eye.
// ═════════════════════════════════════════════════════════════════════

const START_MARKER = 0xff;
const END_MARKER = 0xfe;

/** Convert a single byte (0-255) to an array of 8 bits. */
const byteToBits = (byte) => {
  const bits = [];
  for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  return bits;
};

/** Convert a UTF-8 string to an array of bits. */
const stringToBits = (str) => {
  const bits = [];
  for (const byte of Buffer.from(str, "utf-8")) {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  }
  return bits;
};

/** Convert a 16-bit unsigned integer to 16 bits (big-endian). */
const uint16ToBits = (num) => {
  const bits = [];
  for (let i = 15; i >= 0; i--) bits.push((num >> i) & 1);
  return bits;
};

/**
 * Build the complete bit stream for a payload string.
 * Format: START(8) + LENGTH(16) + PAYLOAD(N*8) + END(8)
 */
const buildBitStream = (text) => [
  ...byteToBits(START_MARKER),
  ...uint16ToBits(Buffer.byteLength(text, "utf-8")),
  ...stringToBits(text),
  ...byteToBits(END_MARKER),
];

/**
 * Embed a tracking ID into the raw pixel data of an image.
 *
 * How it works:
 *   1. Decode image → raw RGBA buffer using Sharp
 *   2. For each pixel, flip the LSB of R, G, B channels to store one bit
 *   3. Re-encode back to the original format (lossless settings)
 *
 * @param {Buffer} inputBuffer  Original image file buffer
 * @param {string} trackingId   The tracking ID to hide inside the image
 * @param {string} mimeType     The original MIME type (image/png, etc.)
 * @returns {Promise<Buffer>}   Processed image buffer with embedded ID
 */
const embedTrackingId = async (inputBuffer, trackingId, mimeType) => {
  // Decode to raw RGBA pixels
  const metadata = await sharp(inputBuffer).metadata();
  const { width, height } = metadata;
  const rawBuffer = await sharp(inputBuffer).ensureAlpha().raw().toBuffer();
  const pixels = Buffer.from(rawBuffer); // mutable copy

  // Prepare bit stream
  const bits = buildBitStream(trackingId);
  const totalPixels = width * height;
  const usableChannels = totalPixels * 3; // R + G + B per pixel (skip A)

  if (bits.length > usableChannels) {
    throw new Error(
      `Image too small to embed tracking ID. ` +
        `Need ${bits.length} channel-bits, have ${usableChannels}.`
    );
  }

  // Write bits into LSBs of R, G, B channels (skip Alpha at index 3)
  let bitIdx = 0;
  for (let px = 0; px < totalPixels && bitIdx < bits.length; px++) {
    const base = px * 4; // 4 bytes per pixel (RGBA)
    for (let ch = 0; ch < 3 && bitIdx < bits.length; ch++) {
      pixels[base + ch] = (pixels[base + ch] & 0xfe) | bits[bitIdx];
      bitIdx++;
    }
  }

  // Re-encode to the original format with lossless settings
  const formatMap = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
    "image/tiff": "tiff",
  };
  const format = formatMap[mimeType] || "png";

  let pipeline = sharp(pixels, { raw: { width, height, channels: 4 } });
  switch (format) {
    case "jpeg":
      pipeline = pipeline.removeAlpha().jpeg({ quality: 100 });
      break;
    case "png":
      pipeline = pipeline.png({ compressionLevel: 0 });
      break;
    case "webp":
      pipeline = pipeline.webp({ lossless: true });
      break;
    case "tiff":
      pipeline = pipeline.tiff();
      break;
    default:
      pipeline = pipeline.png({ compressionLevel: 0 });
  }

  return pipeline.toBuffer();
};

/**
 * Extract the tracking ID from a watermarked image.
 * (Useful for verification in Phase 3)
 *
 * @param {Buffer} imageBuffer  Watermarked image buffer
 * @returns {Promise<string|null>}  Extracted tracking ID, or null
 */
const extractTrackingId = async (imageBuffer) => {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const totalPixels = info.width * info.height;

  // Read LSBs from R, G, B channels
  const allBits = [];
  for (let px = 0; px < totalPixels; px++) {
    const base = px * 4;
    for (let ch = 0; ch < 3; ch++) {
      allBits.push(data[base + ch] & 1);
    }
  }

  // Verify START marker (0xFF = 11111111)
  const startBits = byteToBits(START_MARKER);
  for (let i = 0; i < 8; i++) {
    if (allBits[i] !== startBits[i]) return null;
  }

  // Read 16-bit payload length
  let payloadLen = 0;
  for (let i = 0; i < 16; i++) {
    payloadLen = (payloadLen << 1) | allBits[8 + i];
  }
  if (payloadLen <= 0 || payloadLen > 1000) return null;

  // Read payload bytes
  const payloadStart = 24; // 8 (marker) + 16 (length)
  const bytes = [];
  for (let b = 0; b < payloadLen; b++) {
    let byte = 0;
    for (let i = 0; i < 8; i++) {
      byte = (byte << 1) | allBits[payloadStart + b * 8 + i];
    }
    bytes.push(byte);
  }

  // Verify END marker
  const endStart = payloadStart + payloadLen * 8;
  const endBits = byteToBits(END_MARKER);
  for (let i = 0; i < 8; i++) {
    if (allBits[endStart + i] !== endBits[i]) return null;
  }

  return Buffer.from(bytes).toString("utf-8");
};

// ─── Serve static folders ────────────────────────────────────────────
app.use("/uploads", express.static(uploadDir));
app.use("/processed", express.static(processedDir));

// ─── Root health check ──────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Photo Tracking Server is running (Phase 2)",
  });
});

// ─── POST /upload — Upload image + embed tracking ID ─────────────────
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded. Use form field "image".',
      });
    }

    // 1. Generate a unique tracking ID
    const trackingId = `PTK-${uuidv4()}`;

    // 2. Read original file (already saved by Multer in /uploads)
    const originalBuffer = fs.readFileSync(req.file.path);

    // 3. Embed tracking ID into pixel data (invisible watermark)
    const processedBuffer = await embedTrackingId(
      originalBuffer,
      trackingId,
      req.file.mimetype
    );

    // 4. Save processed (watermarked) image to /processed
    const ext = path.extname(req.file.originalname) || ".png";
    const processedFileName = `${trackingId}${ext}`;
    const processedFilePath = path.join(processedDir, processedFileName);
    fs.writeFileSync(processedFilePath, processedBuffer);

    // 5. Log summary
    console.log("────────────────────────────────────────────");
    console.log("  Tracking ID      :", trackingId);
    console.log("  Original file    :", req.file.filename);
    console.log("  Processed file   :", processedFileName);
    console.log("  Original size    :", originalBuffer.length, "bytes");
    console.log("  Processed size   :", processedBuffer.length, "bytes");
    console.log("────────────────────────────────────────────");

    // 6. Return response
    return res.status(201).json({
      success: true,
      message: "Image uploaded and tracking ID embedded successfully.",
      data: {
        trackingId,
        originalName: req.file.originalname,
        originalFile: req.file.filename,
        processedFile: processedFileName,
        originalSize: originalBuffer.length,
        processedSize: processedBuffer.length,
      },
    });
  } catch (error) {
    console.error("[UPLOAD ERROR]", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Server error during image processing.",
    });
  }
});

// ─── POST /verify — Extract tracking ID from a watermarked image ─────
app.post("/verify", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded. Use form field "image".',
      });
    }

    const imageBuffer = fs.readFileSync(req.file.path);
    const extractedId = await extractTrackingId(imageBuffer);

    // Clean up the temp upload used for verification
    fs.unlinkSync(req.file.path);

    if (!extractedId) {
      return res.status(404).json({
        success: false,
        error: "No tracking ID found in this image.",
      });
    }

    return res.json({
      success: true,
      message: "Tracking ID extracted successfully.",
      data: { trackingId: extractedId },
    });
  } catch (error) {
    console.error("[VERIFY ERROR]", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Server error during verification.",
    });
  }
});

// ─── Global error handler (Multer + generic) ─────────────────────────
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, error: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ─── Start server ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("");
  console.log("  ══════════════════════════════════════════");
  console.log("  Photo Tracking Server – Phase 2");
  console.log(`  http://localhost:${PORT}`);
  console.log("  ══════════════════════════════════════════");
  console.log("");
});
