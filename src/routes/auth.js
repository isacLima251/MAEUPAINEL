const express = require('express');
const { login } = require('../controllers/authController');

module.exports = (db) => {
  const router = express.Router();

  router.post('/login', login(db));

  return router;
};
