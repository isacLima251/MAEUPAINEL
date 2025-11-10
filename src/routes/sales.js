const express = require('express');
const {
  listSales,
  updateSaleStatus,
  assignSaleAttendant
} = require('../controllers/salesController');

module.exports = (db) => {
  const router = express.Router();

  router.get('/sales', listSales(db));
  router.put('/sales/:transactionId/status', updateSaleStatus(db));
  router.put('/sales/:transactionId/attendant', assignSaleAttendant(db));

  return router;
};
