const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dataDirectory = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDirectory, { recursive: true });

const databasePath = path.join(dataDirectory, 'sales.sqlite');
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

module.exports = db;
