const {
  DEFAULT_ATTENDANT,
  MANUAL_STATUS_MAP,
  buildSaleResponse,
  normalizeAttendantCode,
  isValidAttendantCode
} = require('../utils/helpers');

const listSales = (db) => (req, res) => {
  const query = `
    SELECT
      transaction_id,
      status_code,
      status_text,
      client_email,
      client_name,
      client_cpf,
      client_phone,
      product_name,
      total_value_cents,
      created_at,
      updated_at,
      raw_payload,
      attendant_code,
      attendant_name,
      campaign_code
    FROM sales
    ORDER BY datetime(created_at) DESC
  `;

  db.all(query, [], (error, rows) => {
    if (error) {
      console.error('Failed to fetch sales', error);
      return res.status(500).json({ message: 'Failed to fetch sales.' });
    }

    const { status, attendant, search } = req.query || {};

    let sales = (rows || []).map((row) => buildSaleResponse(row));

    if (status) {
      const normalizedStatus = String(status).toLowerCase();
      sales = sales.filter((sale) => {
        const cssClass = (sale.status_css_class || '').toLowerCase();
        const statusText = (sale.status_text || '').toLowerCase();
        const statusCode = sale.status_code !== null && sale.status_code !== undefined
          ? String(sale.status_code)
          : '';

        return (
          cssClass === normalizedStatus ||
          statusText.includes(normalizedStatus) ||
          statusCode === normalizedStatus
        );
      });
    }

    if (attendant) {
      const normalizedAttendant = String(attendant).toLowerCase();
      sales = sales.filter((sale) => {
        const code = (sale.attendant_code || '').toLowerCase();
        return code === normalizedAttendant;
      });
    }

    if (search) {
      const normalizedTerm = String(search).toLowerCase();
      sales = sales.filter((sale) => {
        const fields = [
          sale.client_email,
          sale.client_name,
          sale.client_cpf,
          sale.transaction_id,
          sale.product_name
        ];

        return fields.some((field) => field && String(field).toLowerCase().includes(normalizedTerm));
      });
    }

    return res.json(sales);
  });
};

const updateSaleStatus = (db) => (req, res) => {
  const { transactionId } = req.params || {};
  const { status } = req.body || {};

  if (!transactionId) {
    return res.status(400).json({ message: 'transactionId is required.' });
  }

  const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
  const statusInfo = MANUAL_STATUS_MAP[normalizedStatus];

  if (!statusInfo) {
    return res.status(400).json({ message: 'status must be either "pago" or "frustrado".' });
  }

  const updatedAt = new Date().toISOString();

  db.run(
    `UPDATE sales SET status_code = ?, status_text = ?, updated_at = ? WHERE transaction_id = ?`,
    [statusInfo.code, statusInfo.text, updatedAt, transactionId],
    function (error) {
      if (error) {
        console.error('Failed to update sale status', error);
        return res.status(500).json({ message: 'Failed to update sale status.' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ message: 'Sale not found.' });
      }

      db.get(
        `SELECT
          transaction_id,
          status_code,
          status_text,
          client_email,
          client_name,
          client_cpf,
          client_phone,
          product_name,
          total_value_cents,
          created_at,
          updated_at,
          raw_payload,
          attendant_code,
          attendant_name,
          campaign_code
        FROM sales
        WHERE transaction_id = ?`,
        [transactionId],
        (selectError, row) => {
          if (selectError) {
            console.error('Failed to load updated sale', selectError);
            return res.status(500).json({ message: 'Failed to load updated sale.' });
          }

          return res.json(buildSaleResponse(row));
        }
      );
    }
  );
};

const assignSaleAttendant = (db) => (req, res) => {
  const { transactionId } = req.params || {};
  const body = req.body || {};
  const attendantCode = body.attendantCode ?? body.attendant_code ?? body.attendant;

  if (!transactionId) {
    return res.status(400).json({ message: 'transactionId is required.' });
  }

  const normalizedCode = normalizeAttendantCode(attendantCode);
  const defaultAttendant = DEFAULT_ATTENDANT;

  if (!normalizedCode) {
    return res.status(400).json({ message: 'A valid attendant code is required.' });
  }

  const updateSale = (selectedAttendant) => {
    db.run(
      `UPDATE sales SET attendant_code = ?, attendant_name = ? WHERE transaction_id = ?`,
      [selectedAttendant.code, selectedAttendant.name, transactionId],
      function (error) {
        if (error) {
          console.error('Failed to update attendant for sale', error);
          return res.status(500).json({ message: 'Failed to assign attendant.' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ message: 'Sale not found.' });
        }

        db.get(
          `SELECT * FROM sales WHERE transaction_id = ?`,
          [transactionId],
          (selectError, row) => {
            if (selectError) {
              console.error('Failed to load updated sale', selectError);
              return res.status(500).json({ message: 'Failed to load updated sale.' });
            }

            return res.json(buildSaleResponse(row));
          }
        );
      }
    );
  };

  if (normalizedCode === defaultAttendant.code) {
    return updateSale(defaultAttendant);
  }

  if (!isValidAttendantCode(normalizedCode)) {
    return res.status(400).json({ message: 'A valid 4-character code is required.' });
  }

  db.get(
    `SELECT code, name FROM attendants WHERE code = ?`,
    [normalizedCode],
    (error, attendant) => {
      if (error) {
        console.error('Failed to fetch attendant', error);
        return res.status(500).json({ message: 'Failed to fetch attendant.' });
      }

      if (!attendant) {
        return res.status(404).json({ message: 'Attendant not found.' });
      }

      return updateSale({
        code: normalizeAttendantCode(attendant.code),
        name: attendant.name
      });
    }
  );
};

module.exports = {
  listSales,
  updateSaleStatus,
  assignSaleAttendant
};
