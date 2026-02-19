const { v4: uuidv4 } = require('uuid');
const config = require('../config');

/**
 * Generate a unique tracking ID with a recognizable prefix.
 * Format: PTK-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
const generateTrackingId = () => {
  const uuid = uuidv4();
  return `${config.trackingIdPrefix}-${uuid}`;
};

module.exports = {
  generateTrackingId,
};
