const express = require('express');
const { getSummary } = require('../controllers/summaryController');

module.exports = (db) => {
  const router = express.Router();

  router.get('/summary', getSummary(db));

  return router;
};
