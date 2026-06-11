require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const isNeon = connectionString?.includes('neon.tech');

const pool = connectionString
  ? new Pool({
      connectionString,
      max: isNeon ? 2 : 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  : new Pool({
      host: process.env.PGHOST || 'postgres',
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    });

pool.on('error', (err) => {
  console.error('Pool error:', err.message);
});

// ── Neon keepalive pings ──
// Track the interval handle so we don't leak intervals on cache-busting reloads
let pingInterval = null;

function startPing() {
  stopPing(); // clear previous interval if module is re-required
  const ping = () => pool.query('SELECT 1').catch(() => {});
  if (isNeon) {
    pingInterval = setInterval(ping, 60000);
    pingInterval.unref();
  }
}

function stopPing() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

startPing();

module.exports = pool;
module.exports.pool = pool;
module.exports.startPing = startPing;
module.exports.stopPing = stopPing;
