#!/usr/bin/env node
/**
 * import-is-ai-profitable.js
 * Scrapes isaiprofitable.com's JS bundle to extract AI company financial data
 * (spend, revenue, annual burn rate) and stores it in the metadata table.
 *
 * The site is a React SPA with financial data embedded as a JS array literal.
 * This script fetches the HTML, finds the JS bundle, extracts the data array,
 * and writes it to the metadata table under key '_company_financials'.
 *
 * Usage: node scripts/import-is-ai-profitable.js [--apply]
 *   --apply  : Write to DB metadata table (default: dry-run, print to stdout)
 */

require('dotenv').config();
const https = require('https');
const pool = require('../server/db');

const APPLY = process.argv.includes('--apply');
const SITE_URL = 'https://isaiprofitable.com';

/** Fetch a URL over HTTPS, return body as string */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'GrabFreeModels/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchUrl(new URL(res.headers.location, url).href));
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve(body));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

/** Extract the uc array from the JS bundle using regex */
function extractCompanyData(bundleJs) {
  // The data is in: var uc=[{name:`...`,subtitle:`...`,spend:N,revenue:N,...},...]
  const startIdx = bundleJs.indexOf('var uc=[');
  if (startIdx === -1) throw new Error('Could not find uc array in JS bundle');

  // Find the matching closing bracket by counting nesting level
  let depth = 0;
  let endIdx = -1;
  for (let i = startIdx + 'var uc=['.length; i < bundleJs.length; i++) {
    if (bundleJs[i] === '[') depth++;
    else if (bundleJs[i] === ']') {
      if (depth === 0) {
        endIdx = i;
        break;
      }
      depth--;
    }
  }
  if (endIdx === -1) throw new Error('Could not find closing bracket for uc array');

  const raw = bundleJs.slice(startIdx + 'var uc=['.length, endIdx);
  const companies = [];

  // Split on `},{` to get individual company objects
  const parts = raw.split(/},\{/);

  for (let i = 0; i < parts.length; i++) {
    let part = parts[i];
    // First part starts with `{`, last part ends with `}`
    if (i === 0) part = part.replace(/^\{/, '');
    if (i === parts.length - 1) part = part.replace(/\}$/, '');

    try {
      const c = parseCompanyEntry(part);
      if (c) companies.push(c);
    } catch (err) {
      console.error(`  ⚠ Failed to parse company at index ${i}: ${err.message}`);
    }
  }

  return companies;
}

/** Parse a single company entry from JS object literal */
function parseCompanyEntry(str) {
  // Extract fields with regex (handles backtick template strings, numbers, booleans)
  const fields = {};

  // name: backtick-quoted string
  const nameMatch = str.match(/name:`([^`]*)`/);
  if (!nameMatch) throw new Error('No name field');
  fields.name = nameMatch[1];

  // subtitle: backtick-quoted string
  const subMatch = str.match(/subtitle:`([^`]*)`/);
  if (subMatch) fields.subtitle = subMatch[1];

  // spend: number (int or float)
  const spendMatch = str.match(/spend:([\d.]+)/);
  if (spendMatch) fields.spend = parseFloat(spendMatch[1]);

  // revenue: number (int or float)
  const revMatch = str.match(/revenue:([\d.]+)/);
  if (revMatch) fields.revenue = parseFloat(revMatch[1]);

  // annualBurn: number (int or float)
  const burnMatch = str.match(/annualBurn:([\d.-]+)/);
  if (burnMatch) fields.annualBurn = parseFloat(burnMatch[1]);

  // isInfrastructure: boolean
  fields.isInfrastructure = str.includes('isInfrastructure:!0');

  // logo: backtick-quoted string (data URI) — skip for storage size
  // Just note whether a logo exists
  fields.hasLogo = str.includes('logo:`');

  // Compute PNL
  if (fields.spend !== undefined && fields.revenue !== undefined) {
    fields.pnl = Math.round((fields.revenue - fields.spend) * 100) / 100;
    fields.pnlLabel = fields.pnl >= 0 ? 'profitable' : 'unprofitable';
  }

  return fields;
}

(async () => {
  console.log(`=== Importing AI company financials from ${SITE_URL} ===\n`);

  // 1. Fetch the HTML page
  console.log('Fetching page...');
  const html = await fetchUrl(SITE_URL);

  // 2. Find the JS bundle URL
  const scriptMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
  if (!scriptMatch) throw new Error('Could not find JS bundle in HTML');
  const bundleUrl = new URL(scriptMatch[1], SITE_URL).href;
  console.log(`Found bundle: ${bundleUrl}`);

  // 3. Fetch and parse the JS bundle
  console.log('Fetching JS bundle...');
  const bundleJs = await fetchUrl(bundleUrl);
  const companies = extractCompanyData(bundleJs);

  console.log(`\nParsed ${companies.length} companies:\n`);
  for (const c of companies) {
    const sign = c.pnl >= 0 ? '+' : '';
    console.log(
      `  ${c.name}: spend $${c.spend}B | rev $${c.revenue}B | PNL ${sign}$${c.pnl}B | burn $${c.annualBurn}B/yr${c.isInfrastructure ? ' | infrastructure' : ''}`,
    );
  }

  const payload = {
    description: `AI company financial data from ${SITE_URL} — tracks cumulative spend, revenue, and profit/loss for major AI companies.`,
    fetched_at: new Date().toISOString(),
    source_url: SITE_URL,
    companies,
    summary: {
      total_spend: companies.reduce((s, c) => s + (c.spend || 0), 0),
      total_revenue: companies.reduce((s, c) => s + (c.revenue || 0), 0),
      total_pnl: companies.reduce((s, c) => s + (c.pnl || 0), 0),
      profitable_count: companies.filter((c) => c.pnl >= 0).length,
      unprofitable_count: companies.filter((c) => c.pnl < 0).length,
    },
  };
  payload.summary.total_pnl = Math.round(payload.summary.total_pnl * 100) / 100;

  if (!APPLY) {
    console.log(
      `\n[Dry-run] Would write to metadata._company_financials. ${companies.length} companies, total industry PNL: $${payload.summary.total_pnl}B`,
    );
    console.log(
      `\nSummary: ${payload.summary.profitable_count} profitable, ${payload.summary.unprofitable_count} unprofitable`,
    );
    console.log(
      `Total spend: $${payload.summary.total_spend}B, Total revenue: $${payload.summary.total_revenue}B`,
    );
    await pool.end();
    process.exit(0);
  }

  // 4. Write to metadata table
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Register source if not exists
    await client.query(
      `
      INSERT INTO sources (slug, name, source_type, source_url)
      VALUES ('is-ai-profitable', 'Is AI Profitable Yet?', 'community_list', $1)
      ON CONFLICT (slug) DO UPDATE SET source_url = $1
    `,
      [SITE_URL],
    );

    // Upsert current financials
    await client.query(
      `
      INSERT INTO metadata (key, value)
      VALUES ('_company_financials', $1::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = now()
    `,
      [JSON.stringify(payload)],
    );

    // ── Historical snapshots ──
    // Read existing history, append today's snapshot, keep last 365 entries
    const today = new Date().toISOString().slice(0, 10);
    const { rows: histRows } = await client.query(
      "SELECT value::jsonb FROM metadata WHERE key = '_company_financials_history'",
    );
    let history = histRows.length > 0 ? histRows[0].value || [] : [];
    if (typeof history === 'object' && !Array.isArray(history)) history = [];
    if (!Array.isArray(history)) history = [];

    // Only append if today doesn't already have an entry or data changed
    const lastEntry = history[history.length - 1];
    const snapshot = { date: today, summary: payload.summary, fetched_at: payload.fetched_at };
    if (!lastEntry || lastEntry.date !== today) {
      history.push(snapshot);
      if (history.length > 365) history = history.slice(-365);

      await client.query(
        `
        INSERT INTO metadata (key, value)
        VALUES ('_company_financials_history', $1::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = now()
      `,
        [JSON.stringify(history)],
      );
    }

    await client.query('COMMIT');
    console.log(`\n✓ Wrote ${companies.length} companies to metadata._company_financials`);
    console.log(`✓ History now has ${history.length} snapshot(s)`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`\n✗ Failed: ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
