const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const defaultDatabasePath =
  process.env.SQLITE_DB_PATH || path.join(__dirname, '..', 'data', 'sales.sqlite');

const attendantsRegistry = [
  { code: 'nao_definido', name: 'Não Definido' },
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

const DEFAULT_SETTINGS = {
  user_name: '',
  user_email: '',
  monthly_investment: 0
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

    db.run(
      `CREATE TABLE IF NOT EXISTS attendants (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )`
    );

    const seedStatement = db.prepare(
      `INSERT OR IGNORE INTO attendants (code, name) VALUES (?, ?)`
    );

    attendantsRegistry.forEach((attendant) => {
      const normalizedCode = normalizeAttendantCode(attendant?.code);
      const trimmedName = typeof attendant?.name === 'string' ? attendant.name.trim() : '';

      if (normalizedCode && trimmedName) {
        seedStatement.run(normalizedCode, trimmedName);
      }
    });

    seedStatement.finalize();

    db.run(
      `CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        user_name TEXT,
        user_email TEXT,
        monthly_investment REAL DEFAULT 0
      )`
    );

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

const normalizeAttendantCode = (code) => {
  if (!code && code !== 0) {
    return null;
  }

  const trimmed = String(code).trim();
  return trimmed ? trimmed.toLowerCase() : null;
};

const convertCentsToNumber = (value) => {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return 0;
  }

  return numeric / 100;
};

const roundCurrency = (value) => {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return 0;
  }

  return Number(numeric.toFixed(2));
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

  app.post('/api/attendants', (req, res) => {
    const { name, code } = req.body || {};

    const normalizedCode = normalizeAttendantCode(code);
    if (!normalizedCode || normalizedCode.length !== 4) {
      return res.status(400).json({ message: 'code must contain exactly 4 characters.' });
    }

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) {
      return res.status(400).json({ message: 'name is required.' });
    }

    const insertQuery = `INSERT INTO attendants (code, name) VALUES (?, ?)`;
    db.run(insertQuery, [normalizedCode, trimmedName], (error) => {
      if (error) {
        if (error.message && error.message.toLowerCase().includes('unique')) {
          return res.status(409).json({ message: 'Attendant code already exists.' });
        }

        console.error('Failed to create attendant', error);
        return res.status(500).json({ message: 'Failed to create attendant.' });
      }

      return res.status(201).json({ code: normalizedCode, name: trimmedName });
    });
  });

  app.get('/api/attendants', (req, res) => {
    const query = 'SELECT code, name FROM attendants ORDER BY name COLLATE NOCASE';
    db.all(query, [], (error, rows) => {
      if (error) {
        console.error('Failed to fetch attendants', error);
        return res.status(500).json({ message: 'Failed to fetch attendants.' });
      }

      return res.json(rows || []);
    });
  });

  app.put('/api/sales/:transactionId/attendant', (req, res) => {
    const { transactionId } = req.params;
    const { attendant_code: bodyCode } = req.body || {};

    if (!transactionId) {
      return res.status(400).json({ message: 'transactionId is required.' });
    }

    const normalizedCode = normalizeAttendantCode(bodyCode);
    if (!normalizedCode) {
      return res.status(400).json({ message: 'attendant_code is required.' });
    }

    const defaultAttendant = { code: 'nao_definido', name: 'Não Definido' };

    const updateSale = (attendant) => {
      const selectedAttendant = attendant || defaultAttendant;

      const updateQuery = `
        UPDATE sales
        SET attendant_code = ?, attendant_name = ?
        WHERE transaction_id = ?
      `;

      db.run(
        updateQuery,
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

        return updateSale(attendant);
      }
    );
  });

  app.get('/api/settings', (req, res) => {
    db.get(
      `SELECT user_name AS userName, user_email AS userEmail, monthly_investment AS monthlyInvestment FROM settings WHERE id = 1`,
      (error, row) => {
        if (error) {
          console.error('Failed to load settings', error);
          return res.status(500).json({ message: 'Failed to load settings.' });
        }

        if (!row) {
          return res.json({
            userName: DEFAULT_SETTINGS.user_name,
            userEmail: DEFAULT_SETTINGS.user_email,
            monthlyInvestment: DEFAULT_SETTINGS.monthly_investment
          });
        }

        return res.json({
          userName: row.userName ?? DEFAULT_SETTINGS.user_name,
          userEmail: row.userEmail ?? DEFAULT_SETTINGS.user_email,
          monthlyInvestment: row.monthlyInvestment ?? DEFAULT_SETTINGS.monthly_investment
        });
      }
    );
  });

  app.put('/api/settings', (req, res) => {
    const { userName, userEmail, monthlyInvestment } = req.body || {};

    const preparedName = typeof userName === 'string' ? userName.trim() : DEFAULT_SETTINGS.user_name;
    const preparedEmail = typeof userEmail === 'string' ? userEmail.trim() : DEFAULT_SETTINGS.user_email;
    const preparedInvestment = Number(monthlyInvestment);

    const investmentValue = Number.isFinite(preparedInvestment) ? preparedInvestment : DEFAULT_SETTINGS.monthly_investment;

    db.run(
      `INSERT OR REPLACE INTO settings (id, user_name, user_email, monthly_investment) VALUES (1, ?, ?, ?)`,
      [preparedName, preparedEmail, investmentValue],
      (error) => {
        if (error) {
          console.error('Failed to save settings', error);
          return res.status(500).json({ message: 'Failed to save settings.' });
        }

        return res.json({
          userName: preparedName,
          userEmail: preparedEmail,
          monthlyInvestment: investmentValue
        });
      }
    );
  });

  app.get('/api/summary', (req, res) => {
    const { period = 'this_month', attendant } = req.query || {};

    const conditions = [];
    const params = [];

    if (period === 'this_month') {
      conditions.push("strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')");
    } else if (req.query.startDate && req.query.endDate) {
      conditions.push('datetime(created_at) >= datetime(?)');
      conditions.push('datetime(created_at) <= datetime(?)');
      params.push(req.query.startDate, req.query.endDate);
    }

    const normalizedAttendant = normalizeAttendantCode(attendant);
    if (normalizedAttendant && normalizedAttendant !== 'todos') {
      conditions.push('lower(attendant_code) = ?');
      params.push(normalizedAttendant);
    }

    const query = `
      SELECT transaction_id, status_code, status_text, total_value_cents, created_at, attendant_code
      FROM sales
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    `;

    db.all(query, params, (error, rows) => {
      if (error) {
        console.error('Failed to build summary', error);
        return res.status(500).json({ message: 'Failed to build summary.' });
      }

      db.get(
        `SELECT monthly_investment FROM settings WHERE id = 1`,
        (settingsError, settingsRow) => {
          if (settingsError) {
            console.error('Failed to load settings for summary', settingsError);
            return res.status(500).json({ message: 'Failed to load settings for summary.' });
          }

          const sales = (rows || []).map((row) => ({
            ...row,
            status_css_class: resolveStatusClass(row.status_text, row.status_code)
          }));

          const sumByStatus = (status) =>
            sales
              .filter((sale) => sale.status_css_class === status)
              .reduce((total, sale) => total + convertCentsToNumber(sale.total_value_cents), 0);

          const agendadoMes = sumByStatus('agendado');
          const pagoDoAgendado = sumByStatus('pago');
          const frustradoAgendado = sumByStatus('frustrado');
          const aReceberAgendado = agendadoMes - pagoDoAgendado;
          const vendasDiretas = 0;

          const investimentoTotal = roundCurrency(
            settingsRow?.monthly_investment ?? DEFAULT_SETTINGS.monthly_investment
          );
          const lucroMes = roundCurrency(pagoDoAgendado + vendasDiretas - investimentoTotal);
          const roi = investimentoTotal
            ? roundCurrency((lucroMes / investimentoTotal) * 100)
            : 0;

          return res.json({
            agendadoMes: roundCurrency(agendadoMes),
            pagoDoAgendado: roundCurrency(pagoDoAgendado),
            aReceberAgendado: roundCurrency(aReceberAgendado),
            frustradoAgendado: roundCurrency(frustradoAgendado),
            vendasDiretas: roundCurrency(vendasDiretas),
            investimentoTotal,
            lucroMes,
            roi,
            graficoFunil: [
              roundCurrency(agendadoMes),
              roundCurrency(pagoDoAgendado),
              roundCurrency(aReceberAgendado),
              roundCurrency(frustradoAgendado)
            ],
            graficoComposicao: [
              roundCurrency(pagoDoAgendado),
              roundCurrency(aReceberAgendado),
              roundCurrency(frustradoAgendado)
            ]
          });
        }
      );
    });
  });

  return { app, db };
};

module.exports = {
  createApp,
  initializeDatabase,
  attendantsRegistry
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
