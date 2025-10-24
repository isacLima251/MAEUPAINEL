const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const defaultDatabasePath = process.env.SQLITE_DB_PATH || path.join(__dirname, '..', 'data', 'sales.sqlite');

const ensureDirectoryExists = (databasePath) => {
  if (!databasePath || databasePath === ':memory:') {
    return;
  }

  if (databasePath.startsWith('file:') && databasePath.includes('memory')) {
    return;
  }

  const directory = path.dirname(databasePath);
  fs.mkdirSync(directory, { recursive: true });
};

const initializeDatabase = (databasePath = defaultDatabasePath) => {
  ensureDirectoryExists(databasePath);

  const db = new sqlite3.Database(databasePath);
  db.serialize(() => {
    db.run(
      `CREATE TABLE IF NOT EXISTS sales (
        transaction_id TEXT PRIMARY KEY,
        status_code INTEGER,
        status_text TEXT,
        client_email TEXT,
        product_name TEXT,
        total_value_cents INTEGER,
        created_at TEXT,
        updated_at TEXT,
        raw_payload TEXT
      )`
    );
  });

  return db;
};

const createApp = (options = {}) => {
  const db = options.db || initializeDatabase(options.databasePath);
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.post('/api/postback', (req, res) => {
    const payload = req.body || {};
    const transactionId = payload.transaction_id;

    if (!transactionId) {
      return res.status(400).json({ message: 'transaction_id is required.' });
    }

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const sale = {
      transaction_id: String(transactionId),
      status_code: payload.status_code ?? null,
      status_text: payload.status_text ?? null,
      client_email: payload.client_email ?? null,
      product_name: payload.product_name ?? null,
      total_value_cents: payload.total_value_cents ?? null,
      created_at: payload.created_at || now,
      updated_at: payload.updated_at || now,
      raw_payload: JSON.stringify(payload)
    };

    const upsertQuery = `
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
      ON CONFLICT(transaction_id) DO UPDATE SET
        status_code = excluded.status_code,
        status_text = excluded.status_text,
        client_email = excluded.client_email,
        product_name = excluded.product_name,
        total_value_cents = excluded.total_value_cents,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        raw_payload = excluded.raw_payload
    `;

    const values = [
      sale.transaction_id,
      sale.status_code,
      sale.status_text,
      sale.client_email,
      sale.product_name,
      sale.total_value_cents,
      sale.created_at,
      sale.updated_at,
      sale.raw_payload
    ];

    db.run(upsertQuery, values, (error) => {
      if (error) {
        console.error('Failed to store sale', error);
        return res.status(500).json({ message: 'Failed to store sale.' });
      }

      return res.status(201).json({ message: 'Sale stored successfully.' });
    });
  });

  app.get('/api/sales', (_req, res) => {
    const query = `
      SELECT
        transaction_id,
        status_code,
        status_text,
        client_email,
        product_name,
        total_value_cents,
        created_at,
        updated_at,
        raw_payload
      FROM sales
      ORDER BY datetime(created_at) DESC
    `;

    db.all(query, [], (error, rows) => {
      if (error) {
        console.error('Failed to fetch sales', error);
        return res.status(500).json({ message: 'Failed to fetch sales.' });
      }

      return res.json(rows || []);
    });
  });

  return { app, db };
};

module.exports = {
  createApp,
  initializeDatabase
};

if (require.main === module) {
  const port = process.env.PORT || 3001;
  const { app, db } = createApp();
  const server = app.listen(port, () => {
    console.log(`Backend listening on port ${port}`);
  });

  const shutdown = () => {
    server.close(() => {
      db.close((error) => {
        if (error) {
          console.error('Failed to close database connection cleanly', error);
        }
        process.exit(0);
      });
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
