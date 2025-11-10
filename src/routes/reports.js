const express = require('express');
const { getAttendantsReport } = require('../controllers/reportsController');

module.exports = (db) => {
  const router = express.Router();

  router.get('/reports/attendants', getAttendantsReport(db));

  return router;
};
