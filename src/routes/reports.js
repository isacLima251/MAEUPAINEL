const express = require('express');
const { getAttendantsReport, getCampaignsReport } = require('../controllers/reportsController');

module.exports = (db) => {
  const router = express.Router();

  router.get('/reports/attendants', getAttendantsReport(db));
  router.get('/reports/campaigns', getCampaignsReport(db));

  return router;
};
