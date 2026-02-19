const express = require('express');
const router = express.Router();

const uploadRoutes = require('./uploadRoutes');

// Mount route groups
router.use('/upload', uploadRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Photo Tracking Server is healthy.',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
