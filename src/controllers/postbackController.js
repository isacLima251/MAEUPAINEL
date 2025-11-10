const {
  DEFAULT_ATTENDANT,
  DEFAULT_CAMPAIGN_CODE,
  normalizeCampaignCode,
  buildAttendantCodeCandidates,
  parseClientEmailMetadata,
  extractAttendantFromEmail,
  findAttendantByCodeCandidates,
  resolvePostbackUrl
} = require('../utils/helpers');

const handlePostback = (db) => (req, res) => {
  const payload = req.body || {};
  const transactionId = payload.transaction_id;

  if (!transactionId) {
    return res.status(400).json({ message: 'transaction_id is required.' });
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const emailMetadata = parseClientEmailMetadata(payload.client_email);
  const candidateCodes = buildAttendantCodeCandidates(payload.client_email);

  const finalize = (resolvedAttendant) => {
    const fallbackAttendant = extractAttendantFromEmail(payload.client_email) || DEFAULT_ATTENDANT;
    const attendant = resolvedAttendant || fallbackAttendant || DEFAULT_ATTENDANT;
    const rawCampaignCode = emailMetadata.campaignCode || DEFAULT_CAMPAIGN_CODE;
    const campaignCode = normalizeCampaignCode(rawCampaignCode) || DEFAULT_CAMPAIGN_CODE;

    const persistSale = (campaignName) => {
      const trimmedCampaignName = typeof campaignName === 'string' ? campaignName.trim() : '';
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
        attendant_name: attendant.name || DEFAULT_ATTENDANT.name,
        campaign_code: campaignCode,
        campaign_name: trimmedCampaignName || null
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
          attendant_name,
          campaign_code,
          campaign_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          attendant_name = excluded.attendant_name,
          campaign_code = excluded.campaign_code,
          campaign_name = excluded.campaign_name
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
        sale.attendant_name,
        sale.campaign_code,
        sale.campaign_name
      ];

      db.run(upsertQuery, values, (error) => {
        if (error) {
          console.error('Failed to store sale', error);
          return res.status(500).json({ message: 'Failed to store sale.' });
        }

        return res.status(201).json({ message: 'Sale stored successfully.' });
      });
    };

    db.get(
      `SELECT name FROM campaigns WHERE code = ?`,
      [campaignCode],
      (campaignError, campaignRow) => {
        if (campaignError) {
          console.error('Failed to resolve campaign from code', campaignError);
          return persistSale(null);
        }

        const campaignName = campaignRow?.name || null;
        return persistSale(campaignName);
      }
    );
  };

  findAttendantByCodeCandidates(db, candidateCodes, (lookupError, attendant) => {
    if (lookupError) {
      console.error('Failed to resolve attendant from email', lookupError);
    }

    finalize(attendant);
  });
};

const getPostbackUrl = (options = {}) => (req, res) => {
  const url = resolvePostbackUrl(req, options);
  return res.json({ url });
};

module.exports = {
  handlePostback,
  getPostbackUrl
};
