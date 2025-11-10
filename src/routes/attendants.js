const express = require('express');
const {
  createAttendant,
  listAttendants,
  updateAttendant,
  deleteAttendant
} = require('../controllers/attendantsController');

module.exports = (db) => {
  const router = express.Router();

  router.post('/attendants', createAttendant(db));
  router.get('/attendants', listAttendants(db));
  router.put('/attendants/:code', updateAttendant(db));
  router.delete('/attendants/:code', deleteAttendant(db));

  return router;
};
