const {
  SUMMARY_PERIODS,
  resolveSummaryDateRange,
  normalizeCampaignCode,
  DEFAULT_CAMPAIGN_CODE,
  parseMonthlyCost,
  convertCentsToNumber,
  roundCurrency
} = require('../utils/helpers');

const getCampaignReport = (db) => (req, res) => {
  const { period: rawPeriod, startDate: rawStartDate, endDate: rawEndDate } = req.query || {};

  const normalizedPeriod = typeof rawPeriod === 'string' ? rawPeriod.trim().toLowerCase() : undefined;
  const hasStartDate = typeof rawStartDate === 'string' && rawStartDate.trim();
  const hasEndDate = typeof rawEndDate === 'string' && rawEndDate.trim();
  const hasCustomRange = hasStartDate || hasEndDate;

  if (normalizedPeriod && hasCustomRange) {
    return res.status(400).json({
      message: 'Use either period or startDate/endDate to filter the report, not both.'
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

  const dateColumn = 'COALESCE(s.updated_at, s.created_at)';
  const conditions = [
    `(LOWER(s.status_text) LIKE '%pago%' OR LOWER(s.status_text) LIKE '%aprov%' OR s.status_code = 3)`
  ];
  const params = [DEFAULT_CAMPAIGN_CODE, 'Campanha Não Definida'];

  if (start && end) {
    conditions.push(`datetime(${dateColumn}) >= datetime(?)`);
    conditions.push(`datetime(${dateColumn}) <= datetime(?)`);
    params.push(start, end);
  }

  const query = `
    SELECT
      LOWER(COALESCE(s.campaign_code, ?)) AS normalized_code,
      COALESCE(c.name, s.campaign_name, ?) AS campaign_name,
      COALESCE(c.cost, 0) AS campaign_cost,
      SUM(COALESCE(s.total_value_cents, 0)) AS total_paid_cents
    FROM sales s
    LEFT JOIN campaigns c ON LOWER(c.code) = LOWER(s.campaign_code)
    WHERE ${conditions.join(' AND ')}
    GROUP BY normalized_code
    ORDER BY total_paid_cents DESC
  `;

  db.all(query, params, (error, rows) => {
    if (error) {
      console.error('Failed to build campaign report', error);
      return res.status(500).json({ message: 'Failed to build campaign report.' });
    }

    const report = (rows || []).map((row) => {
      const normalizedCode = normalizeCampaignCode(row?.normalized_code) || DEFAULT_CAMPAIGN_CODE;
      const campaignName = typeof row?.campaign_name === 'string' && row.campaign_name.trim()
        ? row.campaign_name.trim()
        : normalizedCode;

      const revenue = convertCentsToNumber(row?.total_paid_cents);
      const roundedRevenue = roundCurrency(revenue);

      const parsedCost = parseMonthlyCost(row?.campaign_cost);
      const sanitizedCost = Number.isFinite(parsedCost) ? parsedCost : 0;
      const normalizedCost = sanitizedCost < 0 ? 0 : sanitizedCost;
      const roundedCost = roundCurrency(normalizedCost);

      const profitRaw = revenue - normalizedCost;
      const profit = roundCurrency(profitRaw);
      const roi = normalizedCost > 0 ? roundCurrency((profitRaw / normalizedCost) * 100) : 0;

      return {
        code: normalizedCode,
        name: campaignName,
        cost: roundedCost,
        revenue: roundedRevenue,
        profit,
        roi
      };
    });

    return res.json(report);
  });
};

module.exports = {
  getCampaignReport
};
