const { createApp } = require('./app');
const { initializeDatabase } = require('./database');
const { attendantsRegistry } = require('./utils/helpers');

if (require.main === module) {
  const port = process.env.PORT || 3001;
  const { app, db } = createApp();
  const server = app.listen(port, () => {
    console.log(`Backend listening on port ${port}`);
  });

  const shutdown = () => {
    server.close(() => {
      db.close((error) => {
        if (error) {
          console.error('Failed to close database connection cleanly', error);
        }
        process.exit(0);
      });
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = {
  createApp,
  initializeDatabase,
  attendantsRegistry
};
