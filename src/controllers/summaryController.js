const {
  SUMMARY_PERIODS,
  resolveSummaryDateRange,
  normalizeAttendantCode,
  resolveStatusClass,
  convertCentsToNumber,
  roundCurrency,
  parseMonthlyCost,
  DEFAULT_ATTENDANT,
  DEFAULT_SETTINGS
} = require('../utils/helpers');

const getSummary = (db) => (req, res) => {
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
  const dateColumn = 'COALESCE(updated_at, created_at)';

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
};

module.exports = {
  getSummary
};
