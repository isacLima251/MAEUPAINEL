const {
  SUMMARY_PERIODS,
  resolveSummaryDateRange,
  DEFAULT_ATTENDANT,
  normalizeAttendantCode,
  resolveStatusClass
} = require('../utils/helpers');

const getAttendantsReport = (db) => (req, res) => {
  const { period: rawPeriod, startDate: rawStartDate, endDate: rawEndDate } = req.query || {};

  const normalizedPeriod = typeof rawPeriod === 'string' ? rawPeriod.trim().toLowerCase() : undefined;
  const hasStartDate = typeof rawStartDate === 'string' && rawStartDate.trim();
  const hasEndDate = typeof rawEndDate === 'string' && rawEndDate.trim();
  const hasCustomRange = hasStartDate || hasEndDate;

  if (normalizedPeriod && hasCustomRange) {
    return res.status(400).json({
      message: 'Use either period or startDate/endDate to filter the attendant report, not both.'
    });
  }

  if (hasCustomRange && !(hasStartDate && hasEndDate)) {
    return res
      .status(400)
      .json({ message: 'Both startDate and endDate are required for custom attendant report ranges.' });
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
  const dateColumn = 'COALESCE(updated_at, created_at)';

  if (start && end) {
    conditions.push(`datetime(${dateColumn}) >= datetime(?)`);
    conditions.push(`datetime(${dateColumn}) <= datetime(?)`);
    params.push(start, end);
  }

  const query = `
    SELECT
      s.transaction_id,
      s.status_code,
      s.status_text,
      s.total_value_cents,
      s.attendant_code,
      s.attendant_name,
      s.created_at,
      s.updated_at,
      a.name AS attendant_registered_name
    FROM sales s
    LEFT JOIN attendants a ON lower(a.code) = lower(s.attendant_code)
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
  `;

  db.all(query, params, (error, rows) => {
    if (error) {
      console.error('Failed to build attendants report', error);
      return res.status(500).json({ message: 'Failed to build attendants report.' });
    }

    const statsByAttendant = new Map();

    (rows || []).forEach((row) => {
      const normalizedCode = normalizeAttendantCode(row.attendant_code) || DEFAULT_ATTENDANT.code;
      const statusClass = resolveStatusClass(row.status_text, row.status_code);
      const registeredName = typeof row.attendant_registered_name === 'string'
        ? row.attendant_registered_name.trim()
        : '';
      const saleAttendantName = typeof row.attendant_name === 'string' ? row.attendant_name.trim() : '';
      const resolvedName = registeredName || saleAttendantName || DEFAULT_ATTENDANT.name;

      if (!statsByAttendant.has(normalizedCode)) {
        statsByAttendant.set(normalizedCode, {
          attendant_name: resolvedName,
          total_pago_cents: 0,
          agendado_count: 0,
          frustrado_count: 0
        });
      }

      const entry = statsByAttendant.get(normalizedCode);
      entry.attendant_name = resolvedName;

      if (statusClass === 'pago') {
        const totalValue = Number(row.total_value_cents) || 0;
        entry.total_pago_cents += totalValue;
      }

      if (statusClass === 'agendado') {
        entry.agendado_count += 1;
      }

      if (statusClass === 'frustrado') {
        entry.frustrado_count += 1;
      }
    });

    const ranking = Array.from(statsByAttendant.values())
      .filter((item) => item.total_pago_cents > 0)
      .sort((a, b) => b.total_pago_cents - a.total_pago_cents)
      .map((item, index) => ({
        rank: index + 1,
        attendant_name: item.attendant_name,
        total_pago_cents: item.total_pago_cents,
        agendado_count: item.agendado_count,
        frustrado_count: item.frustrado_count
      }));

    return res.json(ranking);
  });
};

module.exports = {
  getAttendantsReport
};
