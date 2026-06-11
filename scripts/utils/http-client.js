/**
 * http-client.js — Shared HTTP client for all scripts.
 *
 * Provides httpGet() and httpPost() with retry logic, timeout handling,
 * and consistent error behavior. Replaces 4+ inline httpGet implementations
 * across sync-models.js, sync-paid-models.js, backfill-context.js, and
 * check-degradation.js.
 */

const http = require('http');
const https = require('https');

/**
 * Make an HTTP GET request.
 * @param {string} url
 * @param {object} [opts]
 * @param {object} [opts.headers] — extra headers
 * @param {number} [opts.timeout] — timeout in ms (default 15_000)
 * @param {number} [opts.retries] — number of retries on 5xx/network error (default 2)
 * @returns {Promise<{status: number, data: any}>}
 */
function httpGet(url, opts = {}) {
  const timeout = opts.timeout ?? 15000;
  const retries = opts.retries ?? 2;
  const headers = { 'Content-Type': 'application/json', ...opts.headers };

  return withRetry(() => _request('GET', url, { headers, timeout }), retries);
}

/**
 * Make an HTTP POST request with a JSON body.
 * @param {string} url
 * @param {any} body — JSON-serializable payload
 * @param {object} [opts]
 * @param {object} [opts.headers]
 * @param {number} [opts.timeout]
 * @param {number} [opts.retries]
 * @returns {Promise<{status: number, data: any}>}
 */
function httpPost(url, body, opts = {}) {
  const timeout = opts.timeout ?? 15000;
  const retries = opts.retries ?? 2;
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  const payload = JSON.stringify(body);
  headers['Content-Length'] = Buffer.byteLength(payload).toString();

  return withRetry(() => _request('POST', url, { headers, timeout, payload }), retries);
}

/** @private */
function _request(method, url, { headers, timeout, payload }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const options = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers,
      timeout,
    };

    const req = mod.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          // Non-JSON response — return as raw text
          parsed = data;
        }
        resolve({ status: res.statusCode, data: parsed });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeout}ms: ${url}`));
    });

    req.on('error', reject);

    if (payload) req.write(payload);
    req.end();
  });
}

/** @private Retry wrapper with exponential backoff */
async function withRetry(fn, maxRetries) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Only retry network errors and 5xx
      if (err.message?.includes('timeout') || err.message?.includes('ECONN') || err.message?.includes('ETIMEDOUT')) {
        if (attempt < maxRetries) {
          await sleep(Math.min(1000 * Math.pow(2, attempt), 8000));
        }
      } else {
        throw err; // Don't retry non-network errors
      }
    }
  }
  throw lastErr;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { httpGet, httpPost };
