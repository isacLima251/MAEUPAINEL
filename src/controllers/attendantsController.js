const {
  normalizeAttendantCode,
  isDefaultAttendantCode,
  isValidAttendantCode,
  parseMonthlyCost
} = require('../utils/helpers');

const createAttendant = (db) => (req, res) => {
  const { name, code, monthlyCost } = req.body || {};

  const normalizedCode = normalizeAttendantCode(code);
  if (isDefaultAttendantCode(normalizedCode)) {
    return res.status(400).json({ message: 'code is reserved for the default attendant.' });
  }

  if (!normalizedCode || !isValidAttendantCode(normalizedCode)) {
    return res.status(400).json({ message: 'code must contain exactly 4 alphanumeric characters.' });
  }

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) {
    return res.status(400).json({ message: 'name is required.' });
  }

  const monthlyCostValue = parseMonthlyCost(monthlyCost);

  const insertQuery = `INSERT INTO attendants (code, name, monthly_cost) VALUES (?, ?, ?)`;
  db.run(insertQuery, [normalizedCode, trimmedName, monthlyCostValue], (error) => {
    if (error) {
      if (error.message && error.message.toLowerCase().includes('unique')) {
        return res.status(409).json({ message: 'Attendant code already exists.' });
      }

      console.error('Failed to create attendant', error);
      return res.status(500).json({ message: 'Failed to create attendant.' });
    }

    return res.status(201).json({
      code: normalizedCode,
      name: trimmedName,
      monthlyCost: monthlyCostValue
    });
  });
};

const listAttendants = (db) => (req, res) => {
  const query = `
    SELECT code, name, monthly_cost AS monthlyCost
    FROM attendants
    ORDER BY name COLLATE NOCASE
  `;
  db.all(query, [], (error, rows) => {
    if (error) {
      console.error('Failed to fetch attendants', error);
      return res.status(500).json({ message: 'Failed to fetch attendants.' });
    }

    const responsePayload = (rows || [])
      .map((row) => {
        const normalizedCode = normalizeAttendantCode(row?.code);
        const trimmedName = typeof row?.name === 'string' ? row.name.trim() : '';

        if (!normalizedCode || !trimmedName) {
          return null;
        }

        if (!isValidAttendantCode(normalizedCode)) {
          return null;
        }

        return {
          code: normalizedCode,
          name: trimmedName,
          monthlyCost: parseMonthlyCost(row?.monthlyCost)
        };
      })
      .filter(Boolean);

    return res.json(responsePayload);
  });
};

const updateAttendant = (db) => (req, res) => {
  const { code: routeCode } = req.params || {};
  const { name, newCode, monthlyCost } = req.body || {};

  const targetCode = normalizeAttendantCode(routeCode);
  if (!targetCode || !isValidAttendantCode(targetCode)) {
    return res.status(400).json({ message: 'A valid 4-character code is required in the route.' });
  }

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) {
    return res.status(400).json({ message: 'name is required.' });
  }

  const normalizedNewCode = newCode ? normalizeAttendantCode(newCode) : targetCode;
  if (isDefaultAttendantCode(normalizedNewCode)) {
    return res.status(400).json({ message: 'newCode is reserved for the default attendant.' });
  }

  if (!normalizedNewCode || !isValidAttendantCode(normalizedNewCode)) {
    return res.status(400).json({ message: 'newCode must contain exactly 4 alphanumeric characters.' });
  }

  const monthlyCostValue = parseMonthlyCost(monthlyCost);

  db.get(
    `SELECT code FROM attendants WHERE lower(code) = ?`,
    [targetCode],
    (selectError, existingAttendant) => {
      if (selectError) {
        console.error('Failed to load attendant for update', selectError);
        return res.status(500).json({ message: 'Failed to load attendant.' });
      }

      if (!existingAttendant) {
        return res.status(404).json({ message: 'Attendant not found.' });
      }

      const updateQuery = `
        UPDATE attendants
        SET code = ?, name = ?, monthly_cost = ?
        WHERE code = ?
      `;

      db.run(
        updateQuery,
        [normalizedNewCode, trimmedName, monthlyCostValue, existingAttendant.code],
        function (updateError) {
          if (updateError) {
            if (updateError.message && updateError.message.toLowerCase().includes('unique')) {
              return res.status(409).json({ message: 'Attendant code already exists.' });
            }

            console.error('Failed to update attendant', updateError);
            return res.status(500).json({ message: 'Failed to update attendant.' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ message: 'Attendant not found.' });
          }

          return res.json({
            code: normalizedNewCode,
            name: trimmedName,
            monthlyCost: monthlyCostValue
          });
        }
      );
    }
  );
};

const deleteAttendant = (db) => (req, res) => {
  const { code } = req.params || {};
  const normalizedCode = normalizeAttendantCode(code);

  if (!normalizedCode || !isValidAttendantCode(normalizedCode)) {
    return res.status(400).json({ message: 'A valid 4-character code is required in the route.' });
  }

  db.run(
    `DELETE FROM attendants WHERE code = ?`,
    [normalizedCode],
    function (error) {
      if (error) {
        console.error('Failed to delete attendant', error);
        return res.status(500).json({ message: 'Failed to delete attendant.' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ message: 'Attendant not found.' });
      }

      return res.status(204).send();
    }
  );
};

module.exports = {
  createAttendant,
  listAttendants,
  updateAttendant,
  deleteAttendant
};
