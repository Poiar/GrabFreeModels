const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const dataRouter = require('./routes/data');
const pool = require('./db');

const app = express();
const PORT = process.env.API_PORT || 3001;

app.use(cors());
app.use(compression());
app.use(express.json());

// Simple rate limiter — 30 requests per minute per IP
const rateLimit = new Map();
app.use('/api/data', (req, res, next) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const window = rateLimit.get(ip) || [];
  const recent = window.filter(t => now - t < 60_000);
  if (recent.length >= 30) return res.status(429).json({ error: 'Too many requests' });
  recent.push(now);
  rateLimit.set(ip, recent);
  next();
});

app.use('/api', dataRouter);

// Serve static health dashboard at /health
app.get('/health', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'health.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

pool.query('SELECT 1').then(() => console.log('DB connected')).catch(err => console.warn('DB unavailable at startup:', err.message));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`GFM API server listening on port ${PORT}`);
});

process.on('SIGTERM', () => { server.close(() => pool.end().catch(() => {})); });
process.on('SIGINT', () => { server.close(() => pool.end().catch(() => {})); });
