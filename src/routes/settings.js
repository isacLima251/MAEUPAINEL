const express = require('express');
const { getSettings, updateSettings } = require('../controllers/settingsController');

module.exports = (db) => {
  const router = express.Router();

  router.get('/settings', getSettings(db));
  router.put('/settings', updateSettings(db));

  return router;
};
