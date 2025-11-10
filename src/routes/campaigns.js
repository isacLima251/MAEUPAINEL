const express = require('express');
const {
  createCampaign,
  listCampaigns,
  updateCampaign,
  deleteCampaign
} = require('../controllers/campaignsController');

module.exports = (db) => {
  const router = express.Router();

  router.post('/campaigns', createCampaign(db));
  router.get('/campaigns', listCampaigns(db));
  router.put('/campaigns/:code', updateCampaign(db));
  router.delete('/campaigns/:code', deleteCampaign(db));

  return router;
};
