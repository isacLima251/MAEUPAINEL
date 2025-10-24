const { createApp } = require('./app');

const PORT = process.env.PORT || 3001;
const { app, db } = createApp();

const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

const gracefulShutdown = () => {
  server.close(() => {
    db.close((error) => {
      if (error) {
        console.error('Failed to close database connection cleanly', error);
      }
      process.exit(0);
    });
  });
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

module.exports = { app, db, server };
