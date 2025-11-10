const { mapSettingsResponse, DEFAULT_SETTINGS } = require('../utils/helpers');

const getSettings = (db) => (req, res) => {
  db.get(
    `SELECT user_name AS userName, user_email AS userEmail, monthly_investment AS monthlyInvestment FROM settings WHERE id = 1`,
    (error, row) => {
      if (error) {
        console.error('Failed to load settings', error);
        return res.status(500).json({ message: 'Failed to load settings.' });
      }

      if (!row) {
        return res.json(mapSettingsResponse());
      }

      return res.json(mapSettingsResponse(row));
    }
  );
};

const updateSettings = (db) => (req, res) => {
  const body = req.body || {};

  const rawName = typeof body.name === 'string' ? body.name : body.userName;
  const rawEmail = typeof body.email === 'string' ? body.email : body.userEmail;
  const rawInvestment = body.investment !== undefined ? body.investment : body.monthlyInvestment;

  const preparedName = typeof rawName === 'string' ? rawName.trim() : DEFAULT_SETTINGS.user_name;
  const preparedEmail = typeof rawEmail === 'string' ? rawEmail.trim() : DEFAULT_SETTINGS.user_email;

  const numericInvestment = Number(rawInvestment);
  const investmentValue = Number.isFinite(numericInvestment)
    ? numericInvestment
    : DEFAULT_SETTINGS.monthly_investment;

  db.run(
    `INSERT OR REPLACE INTO settings (id, user_name, user_email, monthly_investment) VALUES (1, ?, ?, ?)`,
    [preparedName, preparedEmail, investmentValue],
    (error) => {
      if (error) {
        console.error('Failed to save settings', error);
        return res.status(500).json({ message: 'Failed to save settings.' });
      }

      return res.json(
        mapSettingsResponse({
          userName: preparedName,
          userEmail: preparedEmail,
          monthlyInvestment: investmentValue
        })
      );
    }
  );
};

module.exports = {
  getSettings,
  updateSettings
};
