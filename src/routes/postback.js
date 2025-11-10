const express = require('express');
const { handlePostback, getPostbackUrl } = require('../controllers/postbackController');
const { authenticateToken } = require('../middlewares/authMiddleware');

module.exports = (db, options = {}) => {
  const router = express.Router();

  router.get('/postback-url', authenticateToken, getPostbackUrl(options));
  router.post('/postback', handlePostback(db));

  return router;
};
