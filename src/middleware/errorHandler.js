const multer = require('multer');

/**
 * Global error-handling middleware.
 * Catches all errors and returns a consistent JSON response.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, _next) => {
  console.error(`[ERROR] ${err.message}`);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  // Multer-specific errors
  if (err instanceof multer.MulterError) {
    const multerMessages = {
      LIMIT_FILE_SIZE: `File too large. Maximum size is ${(parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024) / (1024 * 1024)}MB.`,
      LIMIT_UNEXPECTED_FILE: 'Unexpected field name. Use "image" as the form field.',
    };
    return res.status(400).json({
      success: false,
      error: multerMessages[err.code] || err.message,
    });
  }

  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      error: messages.join(', '),
    });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      error: 'Duplicate entry detected.',
    });
  }

  // Default
  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    error:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error.'
        : err.message,
  });
};

module.exports = errorHandler;
