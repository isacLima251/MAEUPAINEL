const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const formatDateTime = (value) => {
  if (!value) {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
  }

  if (value instanceof Date) {
    return value.toISOString().replace('T', ' ').substring(0, 19);
  }

  const asString = String(value).trim();
  if (!asString) {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
  }

  // If the payload already provides a format close to what we expect, store as-is.
  return asString;
};

const parseStatusCode = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseTotalValueCents = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : Math.round(value * 100);
  }

  const sanitized = String(value).replace(',', '.').trim();
  if (!sanitized) {
    return null;
  }

  if (/^\d+$/.test(sanitized)) {
    return Number.parseInt(sanitized, 10);
  }

  const parsed = Number.parseFloat(sanitized);
  return Number.isNaN(parsed) ? null : Math.round(parsed * 100);
};

const getFirstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

const normalizePostbackPayload = (body) => {
  const transactionId = getFirstValue(body.transaction_id, body.trans_key, body.trans_id, body.id);
  if (!transactionId) {
    const error = new Error('transaction_id is required.');
    error.status = 400;
    throw error;
  }

  const statusCode = parseStatusCode(getFirstValue(body.status_code, body.trans_status_code));
  const statusText = getFirstValue(body.status_text, body.trans_status);
  const clientEmail = getFirstValue(body.client_email, body.trans_client_email, body.email);
  const productName = getFirstValue(body.product_name, body.trans_prod_name, body.prod_name, body.product);
  const totalValueCents = parseTotalValueCents(
    getFirstValue(body.total_value_cents, body.trans_total_value, body.total_value)
  );
  const createdAt = formatDateTime(getFirstValue(body.created_at, body.trans_createdate));
  const updatedAt = formatDateTime(getFirstValue(body.updated_at, body.trans_updatedate));

  return {
    transaction_id: String(transactionId),
    status_code: statusCode,
    status_text: statusText ? String(statusText) : null,
    client_email: clientEmail ? String(clientEmail) : null,
    product_name: productName ? String(productName) : null,
    total_value_cents: totalValueCents,
    created_at: createdAt,
    updated_at: updatedAt,
    raw_payload: JSON.stringify(body)
  };
};

app.post('/api/postback', (req, res) => {
  let sale;
  try {
    sale = normalizePostbackPayload(req.body || {});
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message });
  }

  db.get(
    'SELECT transaction_id FROM sales WHERE transaction_id = ?',
    [sale.transaction_id],
    (selectError, row) => {
      if (selectError) {
        console.error('Failed to query sale', selectError);
        return res.status(500).json({ message: 'Failed to query existing sale.' });
      }

      if (row) {
        const updateQuery = `
          UPDATE sales
          SET status_code = ?,
              status_text = ?,
              client_email = ?,
              product_name = ?,
              total_value_cents = ?,
              updated_at = ?,
              raw_payload = ?
          WHERE transaction_id = ?
        `;

        db.run(
          updateQuery,
          [
            sale.status_code,
            sale.status_text,
            sale.client_email,
            sale.product_name,
            sale.total_value_cents,
            sale.updated_at,
            sale.raw_payload,
            sale.transaction_id
          ],
          (updateError) => {
            if (updateError) {
              console.error('Failed to update sale', updateError);
              return res.status(500).json({ message: 'Failed to update sale.' });
            }

            return res.json({ message: 'Sale updated successfully.' });
          }
        );
      } else {
        const insertQuery = `
          INSERT INTO sales (
            transaction_id,
            status_code,
            status_text,
            client_email,
            product_name,
            total_value_cents,
            created_at,
            updated_at,
            raw_payload
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.run(
          insertQuery,
          [
            sale.transaction_id,
            sale.status_code,
            sale.status_text,
            sale.client_email,
            sale.product_name,
            sale.total_value_cents,
            sale.created_at,
            sale.updated_at,
            sale.raw_payload
          ],
          (insertError) => {
            if (insertError) {
              console.error('Failed to insert sale', insertError);
              return res.status(500).json({ message: 'Failed to insert sale.' });
            }

            return res.status(201).json({ message: 'Sale stored successfully.' });
          }
        );
      }
    }
  );
});

app.get('/api/sales', (_req, res) => {
  const query = `
    SELECT transaction_id, status_code, status_text, client_email, product_name, total_value_cents, created_at, updated_at
    FROM sales
    ORDER BY datetime(created_at) DESC
  `;

  db.all(query, [], (error, rows) => {
    if (error) {
      console.error('Failed to list sales', error);
      return res.status(500).json({ message: 'Failed to fetch sales.' });
    }

    return res.json(rows || []);
  });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

app.use((error, _req, res, _next) => {
  console.error('Unexpected error', error);
  res.status(error.status || 500).json({ message: error.message || 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

module.exports = app;
