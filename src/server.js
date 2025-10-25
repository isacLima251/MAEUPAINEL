const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const defaultDatabasePath =
  process.env.SQLITE_DB_PATH || path.join(__dirname, '..', 'data', 'sales.sqlite');

const DEFAULT_ATTENDANT = { code: 'nao_definido', name: 'Não Definido' };

const SUMMARY_PERIODS = new Set(['today', 'this_week', 'this_month', 'last_month', 'this_year']);

const attendantsRegistry = [DEFAULT_ATTENDANT];

const normalizeAttendantCode = (code) => {
  if (!code && code !== 0) {
    return null;
  }

  const trimmed = String(code).trim().toLowerCase();
  return trimmed ? trimmed : null;
};

const isDefaultAttendantCode = (code) => normalizeAttendantCode(code) === DEFAULT_ATTENDANT.code;

const isValidAttendantCode = (code) => /^[a-z0-9]{4}$/i.test(code);

const parseMonthlyCost = (value) => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const attendantsMap = attendantsRegistry.reduce((map, attendant) => {
  const normalizedCode = normalizeAttendantCode(attendant?.code);
  const trimmedName = typeof attendant?.name === 'string' ? attendant.name.trim() : '';

  if (!normalizedCode || !trimmedName) {
    return map;
  }

  if (!isDefaultAttendantCode(normalizedCode) && !isValidAttendantCode(normalizedCode)) {
    return map;
  }

  map.set(normalizedCode, {
    code: normalizedCode,
    name: trimmedName
  });

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

const MANUAL_STATUS_MAP = {
  pago: { code: 3, text: 'Pago' },
  frustrado: { code: 5, text: 'Frustrado' }
};

const padTwoDigits = (value) => String(value).padStart(2, '0');

const formatDateTimeForSqlite = (date) => {
  const year = date.getFullYear();
  const month = padTwoDigits(date.getMonth() + 1);
  const day = padTwoDigits(date.getDate());
  const hours = padTwoDigits(date.getHours());
  const minutes = padTwoDigits(date.getMinutes());
  const seconds = padTwoDigits(date.getSeconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const startOfDay = (date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const endOfDay = (date) => {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
};

const parseDateOnly = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const [yearStr, monthStr, dayStr] = trimmed.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const day = Number(dayStr);

  const parsed = new Date(year, month, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
};

const resolveSummaryDateRange = ({ period, startDate, endDate }) => {
  const now = new Date();

  if (startDate && endDate) {
    const parsedStart = parseDateOnly(startDate);
    const parsedEnd = parseDateOnly(endDate);

    if (!parsedStart || !parsedEnd) {
      return { error: 'Invalid startDate or endDate format. Use YYYY-MM-DD.' };
    }

    const rangeStart = startOfDay(parsedStart);
    const rangeEnd = endOfDay(parsedEnd);

    if (rangeStart.getTime() > rangeEnd.getTime()) {
      return { error: 'startDate must be before or equal to endDate.' };
    }

    return {
      start: formatDateTimeForSqlite(rangeStart),
      end: formatDateTimeForSqlite(rangeEnd)
    };
  }

  const effectivePeriod = period && SUMMARY_PERIODS.has(period) ? period : 'today';

  const buildRange = () => {
    switch (effectivePeriod) {
      case 'this_week': {
        const today = startOfDay(now);
        const weekday = today.getDay();
        const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
        today.setDate(today.getDate() - daysSinceMonday);

        const weekEnd = new Date(today);
        weekEnd.setDate(weekEnd.getDate() + 6);

        return {
          start: today,
          end: endOfDay(weekEnd)
        };
      }
      case 'this_month': {
        const monthStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
        const monthEnd = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));

        return { start: monthStart, end: monthEnd };
      }
      case 'last_month': {
        const monthStart = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        const monthEnd = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));

        return { start: monthStart, end: monthEnd };
      }
      case 'this_year': {
        const yearStart = startOfDay(new Date(now.getFullYear(), 0, 1));
        const yearEnd = endOfDay(new Date(now.getFullYear(), 11, 31));

        return { start: yearStart, end: yearEnd };
      }
      case 'today':
      default: {
        const dayStart = startOfDay(now);
        const dayEnd = endOfDay(now);

        return { start: dayStart, end: dayEnd };
      }
    }
  };

  const { start, end } = buildRange();

  return {
    start: formatDateTimeForSqlite(start),
    end: formatDateTimeForSqlite(end)
  };
};

const mapSettingsResponse = (row = {}) => {
  const userName = row.userName ?? row.user_name ?? DEFAULT_SETTINGS.user_name;
  const userEmail = row.userEmail ?? row.user_email ?? DEFAULT_SETTINGS.user_email;
  const monthlyInvestment = row.monthlyInvestment ?? row.monthly_investment ?? DEFAULT_SETTINGS.monthly_investment;

  return {
    name: userName,
    email: userEmail,
    investment: Number(monthlyInvestment) || 0,
    userName,
    userEmail,
    monthlyInvestment: Number(monthlyInvestment) || 0
  };
};

const resolvePostbackUrl = (req, options = {}) => {
  if (options.postbackUrl) {
    return options.postbackUrl;
  }

  if (process.env.POSTBACK_URL) {
    return process.env.POSTBACK_URL;
  }

  const hostHeader = req.get('host') || 'localhost:3001';
  const protocol = req.protocol || 'http';
  return `${protocol}://${hostHeader}/api/postback`;
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

      ensureColumn('client_name');
      ensureColumn('client_cpf');
      ensureColumn('client_phone');
      ensureColumn('attendant_code');
      ensureColumn('attendant_name');
    });

    db.run(
      `CREATE TABLE IF NOT EXISTS attendants (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        monthly_cost REAL DEFAULT 0
      )`
    );

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

  });

  return db;
};

const buildAttendantCodeCandidates = (email) => {
  if (!email || typeof email !== 'string') {
    return [];
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return [];
  }

  const candidateCodes = [];

  const addCandidate = (value) => {
    const normalizedCode = normalizeAttendantCode(value);
    if (!normalizedCode) {
      return;
    }

    if (!candidateCodes.includes(normalizedCode)) {
      candidateCodes.push(normalizedCode);
    }
  };

  if (normalizedEmail.length >= 5) {
    addCandidate(normalizedEmail.slice(0, 5));
  }

  if (normalizedEmail.length >= 4) {
    addCandidate(normalizedEmail.slice(0, 4));
  }

  return candidateCodes;
};

const extractAttendantFromEmail = (email) => {
  const candidateCodes = buildAttendantCodeCandidates(email);

  for (const code of candidateCodes) {
    const attendant = attendantsMap.get(code);
    if (attendant) {
      return attendant;
    }
  }

  return null;
};

const findAttendantByCodeCandidates = (db, candidates, callback) => {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    callback(null, null);
    return;
  }

  const tryIndex = (index) => {
    if (index >= candidates.length) {
      callback(null, null);
      return;
    }

    const candidate = candidates[index];
    if (!candidate) {
      tryIndex(index + 1);
      return;
    }

    db.get(
      `SELECT code, name FROM attendants WHERE lower(code) = ?`,
      [candidate],
      (error, row) => {
        if (error) {
          callback(error);
          return;
        }

        if (row && row.code && row.name) {
          callback(null, {
            code: normalizeAttendantCode(row.code),
            name: typeof row.name === 'string' ? row.name.trim() : row.name
          });
          return;
        }

        tryIndex(index + 1);
      }
    );
  };

  tryIndex(0);
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
    attendant_code: row.attendant_code || DEFAULT_ATTENDANT.code,
    attendant_name: row.attendant_name || DEFAULT_ATTENDANT.name,
    valor_formatado: formatCurrency(row.total_value_cents),
    status_css_class: statusCssClass,
    data_formatada: formatDate(row.created_at)
  };
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

  app.get('/api/postback-url', (req, res) => {
    const url = resolvePostbackUrl(req, options);
    return res.json({ url });
  });

  app.post('/api/postback', (req, res) => {
    const payload = req.body || {};
    const transactionId = payload.transaction_id;

    if (!transactionId) {
      return res.status(400).json({ message: 'transaction_id is required.' });
    }

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const candidateCodes = buildAttendantCodeCandidates(payload.client_email);

    const finalize = (resolvedAttendant) => {
      const fallbackAttendant =
        extractAttendantFromEmail(payload.client_email) || DEFAULT_ATTENDANT;
      const attendant = resolvedAttendant || fallbackAttendant || DEFAULT_ATTENDANT;

      const sale = {
        transaction_id: String(transactionId),
        status_code: payload.status_code ?? null,
        status_text: payload.status_text ?? null,
        client_email: payload.client_email ?? null,
        client_name: payload.client_name ?? null,
        client_cpf: payload.client_cpf ?? null,
        client_phone: payload.client_phone ?? null,
        product_name: payload.product_name ?? null,
        total_value_cents: payload.total_value_cents ?? null,
        created_at: payload.created_at || now,
        updated_at: payload.updated_at || now,
        raw_payload: JSON.stringify(payload),
        attendant_code: attendant.code || DEFAULT_ATTENDANT.code,
        attendant_name: attendant.name || DEFAULT_ATTENDANT.name
      };

      const upsertQuery = `
        INSERT INTO sales (
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
          attendant_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(transaction_id) DO UPDATE SET
          status_code = excluded.status_code,
          status_text = excluded.status_text,
          client_email = excluded.client_email,
          client_name = excluded.client_name,
          client_cpf = excluded.client_cpf,
          client_phone = excluded.client_phone,
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
        sale.client_name,
        sale.client_cpf,
        sale.client_phone,
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
    };

    findAttendantByCodeCandidates(db, candidateCodes, (lookupError, attendant) => {
      if (lookupError) {
        console.error('Failed to resolve attendant from email', lookupError);
      }

      finalize(attendant);
    });
  });

  app.get('/api/sales', (req, res) => {
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
            sale.client_cpf,
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

  app.put('/api/sales/:transactionId/status', (req, res) => {
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
            attendant_name
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
  });

  app.post('/api/attendants', (req, res) => {
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
  });

  app.get('/api/attendants', (req, res) => {
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
  });

  app.put('/api/attendants/:code', (req, res) => {
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
  });

  app.delete('/api/attendants/:code', (req, res) => {
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

    const defaultAttendant = { ...DEFAULT_ATTENDANT };

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
          return res.json(mapSettingsResponse());
        }

        return res.json(mapSettingsResponse(row));
      }
    );
  });

  app.put('/api/settings', (req, res) => {
    const body = req.body || {};

    const rawName = typeof body.name === 'string' ? body.name : body.userName;
    const rawEmail = typeof body.email === 'string' ? body.email : body.userEmail;
    const rawInvestment =
      body.investment !== undefined ? body.investment : body.monthlyInvestment;

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
  });

  app.get('/api/summary', (req, res) => {
    const { period: rawPeriod, startDate: rawStartDate, endDate: rawEndDate, attendant } = req.query || {};

    const normalizedPeriod = typeof rawPeriod === 'string' ? rawPeriod.trim().toLowerCase() : undefined;
    const hasStartDate = typeof rawStartDate === 'string' && rawStartDate.trim();
    const hasEndDate = typeof rawEndDate === 'string' && rawEndDate.trim();
    const hasCustomRange = hasStartDate || hasEndDate;

    if (normalizedPeriod && hasCustomRange) {
      return res.status(400).json({
        message: 'Use either period or startDate/endDate to filter the summary, not both.'
      });
    }

    if (hasCustomRange && !(hasStartDate && hasEndDate)) {
      return res.status(400).json({ message: 'Both startDate and endDate are required for custom ranges.' });
    }

    if (normalizedPeriod && !SUMMARY_PERIODS.has(normalizedPeriod)) {
      return res.status(400).json({ message: 'Invalid period parameter provided.' });
    }

    const period = normalizedPeriod || (hasCustomRange ? undefined : 'today');
    const { error: dateRangeError, start, end } = resolveSummaryDateRange({
      period,
      startDate: hasStartDate ? rawStartDate : undefined,
      endDate: hasEndDate ? rawEndDate : undefined
    });

    if (dateRangeError) {
      return res.status(400).json({ message: dateRangeError });
    }

    const conditions = [];
    const params = [];
    const dateColumn = "COALESCE(updated_at, created_at)";

    if (start && end) {
      conditions.push(`datetime(${dateColumn}) >= datetime(?)`);
      conditions.push(`datetime(${dateColumn}) <= datetime(?)`);
      params.push(start, end);
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

          const computeAndRespond = (investmentValue) => {
            const investimentoTotal = roundCurrency(investmentValue);
            const lucroMes = roundCurrency(pagoDoAgendado + vendasDiretas - investimentoTotal);
            const roi = investimentoTotal
              ? roundCurrency((lucroMes / investimentoTotal) * 100)
              : 0;

            const agendadoTotal = roundCurrency(agendadoMes);
            const pagoTotal = roundCurrency(pagoDoAgendado);
            const aReceberTotal = roundCurrency(aReceberAgendado);
            const frustradoTotal = roundCurrency(frustradoAgendado);
            const vendasDiretasTotal = roundCurrency(vendasDiretas);

            return res.json({
              agendado: agendadoTotal,
              pago: pagoTotal,
              aReceber: aReceberTotal,
              frustrado: frustradoTotal,
              vendasDiretas: vendasDiretasTotal,
              investimento: investimentoTotal,
              lucro: lucroMes,
              roi,
              graficoFunil: [agendadoTotal, pagoTotal, aReceberTotal, frustradoTotal],
              graficoComposicao: [pagoTotal, aReceberTotal, frustradoTotal],
              agendadoMes: agendadoTotal,
              pagoDoAgendado: pagoTotal,
              aReceberAgendado: aReceberTotal,
              frustradoAgendado: frustradoTotal,
              investimentoTotal,
              lucroMes
            });
          };

          const settingsInvestmentRaw =
            settingsRow?.monthly_investment ?? DEFAULT_SETTINGS.monthly_investment;
          const settingsInvestment = parseMonthlyCost(settingsInvestmentRaw);
          const shouldUseAttendantCost =
            normalizedAttendant &&
            normalizedAttendant !== 'todos' &&
            normalizedAttendant !== DEFAULT_ATTENDANT.code;

          if (!shouldUseAttendantCost) {
            return computeAndRespond(settingsInvestment);
          }

          db.get(
            `SELECT monthly_cost FROM attendants WHERE lower(code) = ?`,
            [normalizedAttendant],
            (attendantError, attendantRow) => {
              if (attendantError) {
                console.error('Failed to load attendant monthly cost', attendantError);
                return res.status(500).json({ message: 'Failed to load attendant monthly cost.' });
              }

              const attendantCost = parseMonthlyCost(attendantRow?.monthly_cost);
              return computeAndRespond(attendantCost);
            }
          );
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
