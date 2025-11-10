const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const defaultDatabasePath =
  process.env.SQLITE_DB_PATH || path.join(__dirname, '..', 'data', 'sales.sqlite');

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
        client_name TEXT,
        client_cpf TEXT,
        client_phone TEXT,
        product_name TEXT,
        total_value_cents INTEGER,
        created_at TEXT,
        updated_at TEXT,
        raw_payload TEXT,
        attendant_code TEXT,
        attendant_name TEXT,
        campaign_code TEXT,
        campaign_name TEXT
      )`
    );

    db.all('PRAGMA table_info(sales)', (error, columns) => {
      if (error) {
        console.error('Failed to inspect sales table schema', error);
        return;
      }

      const existingColumns = new Set((columns || []).map((column) => column.name));

      const ensureColumn = (name) => {
        if (!existingColumns.has(name)) {
          db.run(`ALTER TABLE sales ADD COLUMN ${name} TEXT`);
        }
      };

      ensureColumn('client_name');
      ensureColumn('client_cpf');
      ensureColumn('client_phone');
      ensureColumn('attendant_code');
      ensureColumn('attendant_name');
      ensureColumn('campaign_code');
      ensureColumn('campaign_name');
    });

    db.run(
      `CREATE TABLE IF NOT EXISTS attendants (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        monthly_cost REAL DEFAULT 0
      )`
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS campaigns (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cost REAL DEFAULT 0
      )`
    );

    db.all('PRAGMA table_info(campaigns)', (campaignsError, columns) => {
      if (campaignsError) {
        console.error('Failed to inspect campaigns table schema', campaignsError);
        return;
      }

      const existingColumns = new Set((columns || []).map((column) => column.name));

      if (!existingColumns.has('cost')) {
        db.run('ALTER TABLE campaigns ADD COLUMN cost REAL DEFAULT 0');
      }
    });

    db.all('PRAGMA table_info(attendants)', (attendantsError, columns) => {
      if (attendantsError) {
        console.error('Failed to inspect attendants table schema', attendantsError);
        return;
      }

      const existingColumns = new Set((columns || []).map((column) => column.name));
      if (!existingColumns.has('monthly_cost')) {
        db.run('ALTER TABLE attendants ADD COLUMN monthly_cost REAL DEFAULT 0');
      }
    });

    db.run(
      `CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        user_name TEXT,
        user_email TEXT,
        monthly_investment REAL DEFAULT 0
      )`
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
      )`
    );

    const defaultUsername = process.env.ADMIN_USERNAME || 'admin';
    const defaultPassword = process.env.ADMIN_PASSWORD || 'admin';

    if (defaultUsername && defaultPassword) {
      const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;
      const passwordHash = bcrypt.hashSync(String(defaultPassword), saltRounds);

      db.run(
        `INSERT INTO users (username, password_hash)
         VALUES (?, ?)
         ON CONFLICT(username) DO NOTHING`,
        [String(defaultUsername), passwordHash]
      );
    }
  });

  return db;
};

module.exports = {
  initializeDatabase,
  defaultDatabasePath
};
