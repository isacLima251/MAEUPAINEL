const DEFAULT_JWT_SECRET = 'change-this-secret-in-production';

const getJwtSecret = () => process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

module.exports = {
  getJwtSecret
};
