const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // MongoDB
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/photo_tracking',

  // Upload
  uploadDir: path.resolve(__dirname, '../../uploads'),
  processedDir: path.resolve(__dirname, '../../processed'),
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024, // 10MB
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'],

  // Tracking
  trackingIdPrefix: process.env.TRACKING_PREFIX || 'PTK',

  // Security
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,

  // Webhook / Email (Phase 2+)
  webhookUrl: process.env.WEBHOOK_URL || '',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: parseInt(process.env.SMTP_PORT, 10) || 587,
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  alertEmail: process.env.ALERT_EMAIL || '',
};

module.exports = config;
