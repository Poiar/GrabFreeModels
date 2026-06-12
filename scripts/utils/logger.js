/**
 * Structured logger utility.
 * Provides `info`, `warn`, and `error` functions that prepend a timestamp and level.
 * When --json is passed on the process command line, outputs JSON lines for machine parsing.
 * When GFM_LOG_FILE is set, appends to a log file in addition to console output.
 *
 * Usage:
 *   const logger = require('./utils/logger');
 *   logger.info('Message');
 *   logger.info('Message with data', { key: 'value' });
 */

const fs = require('fs');
const JSON_MODE = process.argv.includes('--json');
const LOG_FILE = process.env.GFM_LOG_FILE || null;

function formatPlain(level, msg, data) {
  const ts = new Date().toISOString();
  const base = `${ts} [${level}] ${msg}`;
  return data !== undefined ? `${base} ${JSON.stringify(data)}` : base;
}

function formatJson(level, msg, data) {
  const entry = { ts: new Date().toISOString(), level, msg };
  if (data !== undefined) entry.data = data;
  return JSON.stringify(entry);
}

function write(level, msg, data) {
  const line = JSON_MODE ? formatJson(level, msg, data) : formatPlain(level, msg, data);

  switch (level) {
    case 'ERROR':
      console.error(line);
      break;
    case 'WARN':
      console.warn(line);
      break;
    default:
      console.log(line);
      break;
  }

  if (LOG_FILE) {
    try {
      fs.appendFileSync(LOG_FILE, line + '\n');
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  info: (msg, data) => write('INFO', msg, data),
  warn: (msg, data) => write('WARN', msg, data),
  error: (msg, data) => write('ERROR', msg, data),
  debug: (msg, data) => {
    if (process.env.GFM_DEBUG) write('DEBUG', msg, data);
  },
};
