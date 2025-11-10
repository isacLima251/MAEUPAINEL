const {
  normalizeCampaignCode,
  isValidCampaignCode
} = require('../utils/helpers');

const parseCampaignCost = (value) => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric;
};

const createCampaign = (db) => (req, res) => {
  const { code, name, cost } = req.body || {};

  const normalizedCode = normalizeCampaignCode(code);
  if (!normalizedCode || !isValidCampaignCode(normalizedCode)) {
    return res
      .status(400)
      .json({ message: 'code must contain between 1 and 10 alphanumeric characters.' });
  }

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) {
    return res.status(400).json({ message: 'name is required.' });
  }

  const parsedCost = parseCampaignCost(cost);
  if (parsedCost === null) {
    return res.status(400).json({ message: 'cost must be a valid number.' });
  }

  const insertQuery = `INSERT INTO campaigns (code, name, cost) VALUES (?, ?, ?)`;
  db.run(insertQuery, [normalizedCode, trimmedName, parsedCost], (error) => {
    if (error) {
      if (error.message && error.message.toLowerCase().includes('unique')) {
        return res.status(409).json({ message: 'Campaign code already exists.' });
      }

      console.error('Failed to create campaign', error);
      return res.status(500).json({ message: 'Failed to create campaign.' });
    }

    return res.status(201).json({
      code: normalizedCode,
      name: trimmedName,
      cost: parsedCost
    });
  });
};

const listCampaigns = (db) => (req, res) => {
  const query = `
    SELECT code, name, cost
    FROM campaigns
    ORDER BY name COLLATE NOCASE
  `;

  db.all(query, [], (error, rows) => {
    if (error) {
      console.error('Failed to fetch campaigns', error);
      return res.status(500).json({ message: 'Failed to fetch campaigns.' });
    }

    const responsePayload = (rows || [])
      .map((row) => {
        const normalizedCode = normalizeCampaignCode(row?.code);
        const trimmedName = typeof row?.name === 'string' ? row.name.trim() : '';

        if (!normalizedCode || !trimmedName || !isValidCampaignCode(normalizedCode)) {
          return null;
        }

        return {
          code: normalizedCode,
          name: trimmedName,
          cost: Number(row.cost) || 0
        };
      })
      .filter(Boolean);

    return res.json(responsePayload);
  });
};

const updateCampaign = (db) => (req, res) => {
  const { code: routeCode } = req.params || {};
  const { name, newCode, cost } = req.body || {};

  const targetCode = normalizeCampaignCode(routeCode);
  if (!targetCode || !isValidCampaignCode(targetCode)) {
    return res
      .status(400)
      .json({ message: 'A valid campaign code (1 to 10 alphanumeric characters) is required in the route.' });
  }

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) {
    return res.status(400).json({ message: 'name is required.' });
  }

  const normalizedNewCode = newCode ? normalizeCampaignCode(newCode) : targetCode;
  if (!normalizedNewCode || !isValidCampaignCode(normalizedNewCode)) {
    return res
      .status(400)
      .json({ message: 'newCode must contain between 1 and 10 alphanumeric characters.' });
  }

  const parsedCost = cost === undefined ? undefined : parseCampaignCost(cost);
  if (parsedCost === null) {
    return res.status(400).json({ message: 'cost must be a valid number.' });
  }

  db.get(
    `SELECT code, cost FROM campaigns WHERE lower(code) = ?`,
    [targetCode],
    (selectError, existingCampaign) => {
      if (selectError) {
        console.error('Failed to load campaign for update', selectError);
        return res.status(500).json({ message: 'Failed to load campaign.' });
      }

      if (!existingCampaign) {
        return res.status(404).json({ message: 'Campaign not found.' });
      }

      const nextCost = parsedCost === undefined ? Number(existingCampaign.cost) || 0 : parsedCost;

      const updateQuery = `
        UPDATE campaigns
        SET code = ?, name = ?, cost = ?
        WHERE code = ?
      `;

      db.run(
        updateQuery,
        [normalizedNewCode, trimmedName, nextCost, existingCampaign.code],
        function (updateError) {
          if (updateError) {
            if (updateError.message && updateError.message.toLowerCase().includes('unique')) {
              return res.status(409).json({ message: 'Campaign code already exists.' });
            }

            console.error('Failed to update campaign', updateError);
            return res.status(500).json({ message: 'Failed to update campaign.' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ message: 'Campaign not found.' });
          }

          return res.json({
            code: normalizedNewCode,
            name: trimmedName,
            cost: nextCost
          });
        }
      );
    }
  );
};

const deleteCampaign = (db) => (req, res) => {
  const { code } = req.params || {};
  const normalizedCode = normalizeCampaignCode(code);

  if (!normalizedCode || !isValidCampaignCode(normalizedCode)) {
    return res
      .status(400)
      .json({ message: 'A valid campaign code (1 to 10 alphanumeric characters) is required in the route.' });
  }

  db.run(
    `DELETE FROM campaigns WHERE code = ?`,
    [normalizedCode],
    function (error) {
      if (error) {
        console.error('Failed to delete campaign', error);
        return res.status(500).json({ message: 'Failed to delete campaign.' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ message: 'Campaign not found.' });
      }

      return res.status(204).send();
    }
  );
};

module.exports = {
  createCampaign,
  listCampaigns,
  updateCampaign,
  deleteCampaign
};
