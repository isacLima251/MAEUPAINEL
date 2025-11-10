const express = require('express');
const { getCampaignReport } = require('../controllers/reportsController');

module.exports = (db) => {
  const router = express.Router();

  router.get('/reports/campaigns', getCampaignReport(db));

  return router;
};
