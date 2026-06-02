require('dotenv').config();
const { Pool } = require('pg');

let connectionString = process.env.DATABASE_URL;
if (connectionString && connectionString.includes('sslmode=require') && !connectionString.includes('uselibpqcompat')) {
  connectionString = connectionString.replace('sslmode=require', 'uselibpqcompat=true&sslmode=require');
}

const isNeon = connectionString?.includes('neon.tech');

const pool = connectionString
  ? new Pool({
      connectionString,
      max: isNeon ? 3 : 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  : new Pool({
      host: process.env.PGHOST || 'postgres',
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER || 'gfm',
      password: process.env.PGPASSWORD || 'gfm',
      database: process.env.PGDATABASE || 'grabfreemodels',
    });

if (isNeon) {
  const ping = () => pool.query('SELECT 1').catch(() => {});
  const interval = setInterval(ping, 60000);
  interval.unref();
}

module.exports = pool;
