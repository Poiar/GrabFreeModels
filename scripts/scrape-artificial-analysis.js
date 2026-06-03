#!/usr/bin/env node
/**
 * scrape-artificial-analysis.js
 *
 * Scrapes the AA LLM leaderboard HTML table and stores scores in model_scores.
 * AA page structure: <table with thead/tbody>
 *   Col 0: Model name (div with border-l-4 pl-2)
 *   Col 1: Context window (e.g. "1M", "256k")
 *   Col 2: Creator (anthropic, google, etc.)
 *   Col 3: Intelligence score (integer)
 *   Col 4: Blended price (e.g. ".10")
 *   Col 5: Output speed (tokens/s)
 *   Col 6: Latency TTFT (seconds)
 *   Col 7: Total response time (seconds)
 */

const https = require('https');
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');
const connectionString = process.env.DATABASE_URL;
const pool = connectionString
  ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
  : new Pool({ host: process.env.PGHOST || 'localhost', port: parseInt(process.env.PGPORT || '5432'), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE });

const SOURCE = 'artificial_analysis';

function fetchPage() {
  return new Promise((resolve, reject) => {
    https.get('https://artificialanalysis.ai/leaderboards/models', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

function parseContext(str) {
  str = str.trim().toUpperCase();
  if (str.endsWith('M')) return parseFloat(str) * 1048576;
  if (str.endsWith('K')) return parseFloat(str) * 1024;
  return parseFloat(str) || null;
}

function extractModels(html) {
  const tbodyIdx = html.indexOf('<tbody');
  if (tbodyIdx < 0) return [];
  const tbody = html.substring(tbodyIdx, html.indexOf('</tbody>', tbodyIdx) + 8);

  const models = [];
  // Split by <tr> to get rows
  const rowParts = tbody.split('<tr');
  for (let i = 1; i < rowParts.length; i++) {
    const row = rowParts[i];
    // Extract all <td> contents
    const cells = [];
    let pos = 0;
    while (true) {
      const tdStart = row.indexOf('<td', pos);
      if (tdStart < 0) break;
      const tdContent = row.indexOf('>', tdStart) + 1;
      const tdEnd = row.indexOf('</td>', tdContent);
      if (tdEnd < 0) break;
      // Strip HTML tags from cell
      let cellText = row.substring(tdContent, tdEnd);
      cellText = cellText.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
      cells.push(cellText);
      pos = tdEnd + 5;
    }

    // We need at least 8 cells: name, ctx, creator, intel, price, speed, ttft, total
    if (cells.length < 8) continue;

    // Validate: cell[3] should be a number (intelligence)
    const intelligence = parseInt(cells[3], 10);
    if (isNaN(intelligence) || intelligence < 1 || intelligence > 100) continue;

    models.push({
      name: cells[0],
      creator: cells[2],
      context: parseContext(cells[1]),
      intelligence,
      price: parseFloat((cells[4] || '').replace('$', '').replace(',', '')) || null,
      speed: parseFloat(cells[5]) || null,
      ttft: parseFloat(cells[6]) || null,
      total: parseFloat(cells[7]) || null,
    });
  }
  return models;
}

function normalizeName(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/instruct|chat|preview|v\d+|free|turbo|lite|high|medium|low|max|xl|xxl|small|base|nonreasoning|adaptive/g, '')
    .replace(/(google|anthropic|openai|meta|nvidia|xai|alibaba|minimax|xiaomi|zai|mistral|cohere|deepseek|ibm|amazon|bytedance|baidu|tencent|lg|stepfun|inception|command)/, '')
    .trim();
}

async function scrape() {
  console.log('Fetching Artificial Analysis leaderboard...');
  const html = await fetchPage();
  const models = extractModels(html);

  if (models.length === 0) {
    console.log('ERROR: No models extracted');
    process.exit(1);
  }
  console.log('Extracted', models.length, 'models');

  // Quick sanity check on the data
  console.log('First 3:');
  models.slice(0, 3).forEach(m => console.log(' ', m.name, 'intel:', m.intelligence, 'price:', m.price, 'ctx:', m.context));

  const { rows: ourModels } = await pool.query(
    "SELECT dm.id, dm.full_id, mm.name AS super_name FROM datapoint_models dm JOIN super_models mm ON mm.id = dm.super_model_id WHERE dm.is_free = true AND dm.status_result = 'working' AND dm.is_removed = false"
  );

  let matched = 0;
  const changes = [];

  for (const aa of models) {
    const aaNorm = normalizeName(aa.name);
    let best = null, bestScore = 0;
    for (const m of ourModels) {
      const n = normalizeName(m.super_name);
      if (aaNorm === n) { best = m; bestScore = 100; break; }
      if (aaNorm.includes(n) || n.includes(aaNorm)) {
        const s = Math.min(aaNorm.length, n.length) / Math.max(aaNorm.length, n.length);
        if (s > bestScore && s > 0.4) { bestScore = s; best = m; }
      }
    }
    if (best) {
      matched++;
      const sc = [];
      if (aa.intelligence) sc.push({ t: 'intelligence', v: aa.intelligence });
      if (aa.price) sc.push({ t: 'price_blended', v: aa.price });
      if (aa.speed) sc.push({ t: 'output_speed', v: aa.speed });
      if (aa.ttft) sc.push({ t: 'latency_ttft', v: aa.ttft });
      if (aa.total) sc.push({ t: 'latency_total', v: aa.total });
      if (aa.context) sc.push({ t: 'context_window', v: aa.context });
      if (sc.length > 0) changes.push({ id: best.id, aa: aa.name, our: best.super_name, sc });
    }
  }

  console.log('Matched:', matched + '/' + models.length);
  if (!changes.length) { console.log('No changes.'); return; }

  console.log('\\nSample:');
  changes.slice(0, 10).forEach(c => console.log('  ' + c.our + ' <- ' + c.aa + ': ' + c.sc.map(s => s.t + '=' + s.v).join(', ')));

  if (!APPLY) { console.log('\\nDry-run. Use --apply.'); return; }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let n = 0;
    for (const c of changes) {
      for (const s of c.sc) {
        await client.query(
          'INSERT INTO model_scores (datapoint_model_id, source, score_type, score_value, fetched_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (datapoint_model_id, source, score_type) DO UPDATE SET score_value=EXCLUDED.score_value, fetched_at=now()',
          [c.id, SOURCE, s.t, s.v]
        );
        n++;
      }
    }
    await client.query('COMMIT');
    console.log(n, 'scores written (' + changes.length + ' models).');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

scrape().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
