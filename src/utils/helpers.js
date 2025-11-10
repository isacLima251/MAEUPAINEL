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

module.exports = {
  DEFAULT_ATTENDANT,
  attendantsRegistry,
  normalizeAttendantCode,
  isDefaultAttendantCode,
  isValidAttendantCode,
  parseMonthlyCost,
  DEFAULT_SETTINGS,
  MANUAL_STATUS_MAP,
  SUMMARY_PERIODS,
  resolveSummaryDateRange,
  mapSettingsResponse,
  resolvePostbackUrl,
  buildAttendantCodeCandidates,
  extractAttendantFromEmail,
  findAttendantByCodeCandidates,
  formatCurrency,
  formatDate,
  resolveStatusClass,
  buildSaleResponse,
  convertCentsToNumber,
  roundCurrency
};
