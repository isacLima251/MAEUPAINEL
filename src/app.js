const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./database');
const createSalesRoutes = require('./routes/sales');
const createAttendantRoutes = require('./routes/attendants');
const createSettingsRoutes = require('./routes/settings');
const createSummaryRoutes = require('./routes/summary');
const createPostbackRoutes = require('./routes/postback');
const createAuthRoutes = require('./routes/auth');
const { authenticateToken } = require('./middlewares/authMiddleware');

const createApp = (options = {}) => {
  const db = options.db || initializeDatabase(options.databasePath);
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api', createAuthRoutes(db));
  app.use('/api', createPostbackRoutes(db, options));

  app.use('/api', authenticateToken);
  app.use('/api', createSalesRoutes(db));
  app.use('/api', createAttendantRoutes(db));
  app.use('/api', createSettingsRoutes(db));
  app.use('/api', createSummaryRoutes(db));

  return { app, db };
};

module.exports = {
  createApp
};
