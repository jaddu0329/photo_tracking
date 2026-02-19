const app = require('./app');
const config = require('./config');

// Phase 2 – No database connection required yet.
// const connectDB = require('./config/db');

const startServer = async () => {
  // Database connection will be added in a later phase.
  // await connectDB();

  app.listen(config.port, () => {
    console.log('═══════════════════════════════════════════════');
    console.log(`  Photo Tracking Server – Phase 2`);
    console.log(`  Environment : ${config.nodeEnv}`);
    console.log(`  Port        : ${config.port}`);
    console.log(`  Database    : not connected (Phase 2)`);
    console.log('═══════════════════════════════════════════════');
  });
};

startServer().catch((err) => {
  console.error('[FATAL] Failed to start server:', err);
  process.exit(1);
});
