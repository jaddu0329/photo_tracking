const { processUpload } = require('../services/imageService');

/**
 * POST /api/v1/upload
 * Handles image upload, embeds tracking ID, stores record.
 */
const uploadImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided. Use form field "image".',
      });
    }

    const uploaderIp =
      req.headers['x-forwarded-for'] ||
      req.connection?.remoteAddress ||
      req.ip;

    const result = await processUpload(req.file, uploaderIp);

    return res.status(201).json({
      success: true,
      message: 'Image uploaded and tracking ID embedded successfully.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadImage,
};
