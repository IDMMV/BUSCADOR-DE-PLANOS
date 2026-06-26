const express = require('express');
const router  = express.Router();
const { getToken } = require('../services/aps');

router.get('/token', async (req, res) => {
  try {
    const token = await getToken();
    res.json({ access_token: token, expires_in: 3600 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
