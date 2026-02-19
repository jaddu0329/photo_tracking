const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const config = require('./config');
const routes = require('./routes');
const upload = require('./middleware/multerConfig');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ─── Security Middleware ─────────────────────────────────────────────
app.use(helmet()); // sets various HTTP security headers
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  })
);

// ─── Rate Limiting ───────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
  },
});
app.use(limiter);

// ─── Body Parsers ────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Request Logging ─────────────────────────────────────────────────
if (config.nodeEnv !== 'test') {
  app.use(morgan('combined'));
}

// ─── Static Files ────────────────────────────────────────────────────
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));
app.use('/processed', express.static(path.resolve(__dirname, '../processed')));

// ─── Root ────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Photo Tracking Server is running.',
    version: '1.0.0',
  });
});

// ─── API Routes ──────────────────────────────────────────────────────
app.use('/api/v1', routes);

// ─── Upload Route ────────────────────────────────────────────────────
app.post("/upload", upload.single("image"), (req, res) => {
    try {

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No image uploaded"
            });
        }

        const trackingId = uuidv4();

        console.log("Tracking ID:", trackingId);
        console.log("File Info:", req.file);

        res.json({
            success: true,
            trackingId: trackingId,
            fileName: req.file.filename
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Upload failed"
        });
    }
});

// ─── 404 Handler ─────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found.',
  });
});

// ─── Global Error Handler ────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
K