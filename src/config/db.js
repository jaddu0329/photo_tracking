const mongoose = require('mongoose');
const config = require('./index');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000, // fail fast if MongoDB is not reachable
      socketTimeoutMS: 45000,
    });
    console.log(`[DB] MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[DB] Connection error: ${error.message}`);
    console.error('[DB] Make sure MongoDB is running on', config.mongoUri);
    process.exit(1);
  }
};

module.exports = connectDB;
