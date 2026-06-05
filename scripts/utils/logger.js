/**
 * Simple logger utility.
 * Provides `info`, `warn`, and `error` functions that prepend a timestamp and level.
 * Usage: const logger = require('./utils/logger');
 * logger.info('Message');
 */

function format(level, msg) {
  const ts = new Date().toISOString();
  return `${ts} [${level}] ${msg}`;
}

module.exports = {
  info: (msg) => console.log(format('INFO', msg)),
  warn: (msg) => console.warn(format('WARN', msg)),
  error: (msg) => console.error(format('ERROR', msg)),
};
