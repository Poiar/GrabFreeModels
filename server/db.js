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

if (isNeon) {
  const ping = () => pool.query('SELECT 1').catch(() => {});
  const interval = setInterval(ping, 60000);
  interval.unref();
}

module.exports = pool;
