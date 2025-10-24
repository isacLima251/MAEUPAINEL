const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const defaultDatabasePath =
  process.env.SQLITE_DB_PATH || path.join(__dirname, '..', 'data', 'sales.sqlite');

const attendantsRegistry = [
  { code: 'j1.12', name: 'João' },
  { code: 'm2.34', name: 'Maria' },
  { code: 'paul', name: 'Paulo' },
  { code: 'joao', name: 'João' },
  { code: 'mari', name: 'Maria' }
];

const attendantsMap = attendantsRegistry.reduce((map, attendant) => {
  if (attendant?.code) {
    map.set(attendant.code.toLowerCase(), {
      code: attendant.code,
      name: attendant.name
    });
  }
  return map;
}, new Map());

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
        raw_payload TEXT,
        attendant_code TEXT,
        attendant_name TEXT
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

      ensureColumn('attendant_code');
      ensureColumn('attendant_name');
    });
  });

  return db;
};

const extractAttendantFromEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const candidateCodes = [];

  if (normalizedEmail.length >= 5) {
    candidateCodes.push(normalizedEmail.slice(0, 5));
  }

  if (normalizedEmail.length >= 4) {
    candidateCodes.push(normalizedEmail.slice(0, 4));
  }

  for (const code of candidateCodes) {
    const attendant = attendantsMap.get(code);
    if (attendant) {
      return attendant;
    }
  }

  return null;
};

const formatCurrency = (valueInCents) => {
  if (valueInCents === null || valueInCents === undefined) {
    return null;
  }

  const number = Number(valueInCents) / 100;
  if (Number.isNaN(number)) {
    return null;
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(number);
};

const formatDate = (dateString) => {
  if (!dateString) {
    return null;
  }

  const [datePart] = String(dateString).split(' ');
  const [year, month, day] = (datePart || '').split('-');

  if (!year || !month || !day) {
    return dateString;
  }

  return `${day}/${month}/${year}`;
};

const resolveStatusClass = (statusText, statusCode) => {
  const normalizedText = (statusText || '').toString().toLowerCase();

  if (normalizedText.includes('pago') || normalizedText.includes('aprov')) {
    return 'pago';
  }

  if (normalizedText.includes('agend') || normalizedText.includes('aguard') || normalizedText.includes('pend')) {
    return 'agendado';
  }

  if (normalizedText.includes('frustr') || normalizedText.includes('cancel') || normalizedText.includes('reemb')) {
    return 'frustrado';
  }

  if (normalizedText.includes('cobran') || normalizedText.includes('recorr')) {
    return 'cobranca';
  }

  if (statusCode !== null && statusCode !== undefined) {
    const numericCode = Number(statusCode);
    if (!Number.isNaN(numericCode)) {
      switch (numericCode) {
        case 3:
          return 'pago';
        case 2:
          return 'agendado';
        case 5:
          return 'frustrado';
        case 4:
          return 'cobranca';
        default:
          break;
      }
    }
  }

  return 'desconhecido';
};

const buildSaleResponse = (row) => {
  if (!row) {
    return row;
  }

  const statusCssClass = resolveStatusClass(row.status_text, row.status_code);

  return {
    ...row,
    attendant_code: row.attendant_code || 'nao_definido',
    attendant_name: row.attendant_name || 'Não Definido',
    valor_formatado: formatCurrency(row.total_value_cents),
    status_css_class: statusCssClass,
    data_formatada: formatDate(row.created_at)
  };
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
    const attendant = extractAttendantFromEmail(payload.client_email);
    const sale = {
      transaction_id: String(transactionId),
      status_code: payload.status_code ?? null,
      status_text: payload.status_text ?? null,
      client_email: payload.client_email ?? null,
      product_name: payload.product_name ?? null,
      total_value_cents: payload.total_value_cents ?? null,
      created_at: payload.created_at || now,
      updated_at: payload.updated_at || now,
      raw_payload: JSON.stringify(payload),
      attendant_code: attendant?.code || 'nao_definido',
      attendant_name: attendant?.name || 'Não Definido'
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
        raw_payload,
        attendant_code,
        attendant_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(transaction_id) DO UPDATE SET
        status_code = excluded.status_code,
        status_text = excluded.status_text,
        client_email = excluded.client_email,
        product_name = excluded.product_name,
        total_value_cents = excluded.total_value_cents,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        raw_payload = excluded.raw_payload,
        attendant_code = excluded.attendant_code,
        attendant_name = excluded.attendant_name
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
      sale.raw_payload,
      sale.attendant_code,
      sale.attendant_name
    ];

    db.run(upsertQuery, values, (error) => {
      if (error) {
        console.error('Failed to store sale', error);
        return res.status(500).json({ message: 'Failed to store sale.' });
      }

      return res.status(201).json({ message: 'Sale stored successfully.' });
    });
  });

  app.get('/api/sales', (req, res) => {
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
        raw_payload,
        attendant_code,
        attendant_name
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
            sale.cpf,
            sale.transaction_id,
            sale.product_name
          ];

          return fields.some((field) =>
            field && String(field).toLowerCase().includes(normalizedTerm)
          );
        });
      }

      return res.json(sales);
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
