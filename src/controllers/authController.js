const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../utils/auth');

const login = (db) => (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ message: 'username and password are required.' });
  }

  db.get(
    `SELECT id, username, password_hash FROM users WHERE username = ?`,
    [String(username)],
    (error, user) => {
      if (error) {
        console.error('Failed to query user for login', error);
        return res.status(500).json({ message: 'Failed to authenticate.' });
      }

      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials.' });
      }

      bcrypt.compare(String(password), user.password_hash, (compareError, isMatch) => {
        if (compareError) {
          console.error('Failed to compare password hash', compareError);
          return res.status(500).json({ message: 'Failed to authenticate.' });
        }

        if (!isMatch) {
          return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const token = jwt.sign(
          { userId: user.id, username: user.username },
          getJwtSecret(),
          { expiresIn: '8h' }
        );

        return res.json({ token });
      });
    }
  );
};

module.exports = {
  login
};
