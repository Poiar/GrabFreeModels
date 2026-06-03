const express = require('express');
const pool = require('../db');
const loadModels = require('../../scripts/load-models');

const router = express.Router();

router.get('/data', async (req, res) => {
  try {
    const result = await loadModels(pool);
    res.json(result);
  } catch (err) {
    console.error('Failed to build ModelsData:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT now()');
    res.json({ status: 'ok', db: rows[0].now, time: new Date().toISOString() });
  } catch (err) {
    console.error('Health check failed:', err.message);
    res.status(503).json({ status: 'error', db: 'Database unavailable', time: new Date().toISOString() });
  }
});

module.exports = router;
