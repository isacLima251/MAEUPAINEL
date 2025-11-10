const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../utils/auth');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return res.status(401).json({ message: 'Authentication token is required.' });
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Invalid authorization header format.' });
  }

  jwt.verify(token, getJwtSecret(), (error, decoded) => {
    if (error) {
      return res.status(401).json({ message: 'Invalid or expired token.' });
    }

    req.user = decoded;
    return next();
  });
};

module.exports = {
  authenticateToken
};
