const express = require('express');
const router = express.Router();
const upload = require('../middleware/multerConfig');
const { uploadImage } = require('../controllers/uploadController');

/**
 * POST /api/v1/upload
 * Upload a single image with tracking ID embedding.
 * Form field name: "image"
 */
router.post('/', upload.single('image'), uploadImage);

module.exports = router;
