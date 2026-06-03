#!/usr/bin/env node
/**
 * scrape-artificial-analysis.js
 *
 * Scrapes the AA LLM leaderboard HTML table and stores scores in model_scores.
 * AA page structure: <table with thead/tbody>
 *   Col 0: Model name
 *   Col 1: Context window
 *   Col 2: Creator
 *   Col 3: Intelligence score
 *   Col 4: Blended price
 *   Col 5: Output speed (tokens/s)
 *   Col 6: Latency TTFT (seconds)
 *   Col 7: Total response time (seconds)
 */

require('dotenv').config();
const https = require('https');
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');
const connectionString = process.env.DATABASE_URL;
const pool = connectionString
  ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
  : new Pool({ host: process.env.PGHOST || 'localhost', port: parseInt(process.env.PGPORT || '5432'), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE });

const SOURCE = 'artificial_analysis';

// Manual name overrides: AA model name -> our super_name
const NAME_OVERRIDES = new Map([
  ['Gemini 3.1 Pro Preview', 'Gemini 3 Pro Preview'],
  ['Gemini 3.1 Flash-Lite', 'Gemini 3 Flash Preview'],
  ['Mistral Small 4', 'Mistral Small 4 119B 2603'],
  ['Mistral Large 3', 'Mistral Large 3 675B Instruct 2512'],
  ['Qwen3.5 Omni Plus', 'Qwen3.5 Plus'],
  ['Qwen3.5 Omni Flash', 'Qwen3.6 Flash'],
  ['Command A+', 'Cohere Command A'],
  ['Nemotron Cascade 2 30B A3B', 'Nemotron 3 Nano 30B'],
  ['Qwen3 Omni 30B A3B', 'Qwen3 30B A3B'],
  ['Gemma 4 E2B', 'Gemma 3n E2b It'],
  ['MiniCPM5-1B', 'MiniCPM-V 4.6 1.3B'],
  ['GPT-5.3 Codex (xhigh)', 'GPT-5.3 Codex'],
  ['GPT-5.5 Instant (May 2026)', 'GPT-5.5'],
  ['LFM2.5-VL-1.6B', 'LFM2.5-1.2B-Instruct'],
  ['Magistral Medium 1.2', 'Mistral Medium 3'],
  ['Magistral Small 1.2', 'Magistral Small 2506'],
]);

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
  const rowParts = tbody.split('<tr');
  for (let i = 1; i < rowParts.length; i++) {
    const row = rowParts[i];
    const cells = [];
    let pos = 0;
    while (true) {
      const tdStart = row.indexOf('<td', pos);
      if (tdStart < 0) break;
      const tdContent = row.indexOf('>', tdStart) + 1;
      const tdEnd = row.indexOf('</td>', tdContent);
      if (tdEnd < 0) break;
      let cellText = row.substring(tdContent, tdEnd);
      cellText = cellText.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
      cells.push(cellText);
      pos = tdEnd + 5;
    }

    if (cells.length < 8) continue;
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
    .replace(/\b(instruct|chat|preview|turbo|lite|nonreasoning|adaptive)\b/g, '')
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
  console.log('First 3:');
  models.slice(0, 3).forEach(m => console.log(' ', m.name, 'intel:', m.intelligence, 'price:', m.price, 'ctx:', m.context));

  // Load all free datapoints grouped by super_name, prefer working
  const { rows: allRows } = await pool.query(
    "SELECT dm.id, dm.full_id, mm.name AS super_name, dm.status_result FROM datapoint_models dm JOIN super_models mm ON mm.id = dm.super_model_id WHERE dm.is_free = true AND dm.is_removed = false ORDER BY dm.status_result = 'working' DESC, dm.status_result = 'untested' DESC"
  );
  // Deduplicate: for each super_name, pick the best datapoint (working > untested > other)
  const bestBySuper = new Map();
  for (const r of allRows) {
    if (!bestBySuper.has(r.super_name)) {
      bestBySuper.set(r.super_name, r);
    }
  }
  const ourModels = Array.from(bestBySuper.values());
  console.log('Our unique free super models:', ourModels.length);

  let matched = 0;
  const changes = [];

  for (const aa of models) {
    // Check manual override first
    const override = NAME_OVERRIDES.get(aa.name);
    if (override) {
      const found = ourModels.find(m => m.super_name === override);
      if (found) {
        matched++;
        const sc = buildScores(aa);
        if (sc.length > 0) changes.push({ id: found.id, aa: aa.name, our: found.super_name, sc });
        continue;
      }
    }

    const aaNorm = normalizeName(aa.name);
    let best = null, bestScore = 0;
    for (const m of ourModels) {
      const n = normalizeName(m.super_name);
      if (aaNorm === n) { best = m; bestScore = 100; break; }
      if (aaNorm.includes(n) || n.includes(aaNorm)) {
        const s = Math.min(aaNorm.length, n.length) / Math.max(aaNorm.length, n.length);
        if (s > bestScore && s > 0.5) { bestScore = s; best = m; }
      }
    }
    if (best) {
      matched++;
      const sc = buildScores(aa);
      if (sc.length > 0) changes.push({ id: best.id, aa: aa.name, our: best.super_name, sc });
    }
  }

  console.log('Matched:', matched + '/' + models.length);
  if (!changes.length) { console.log('No changes.'); return; }

  // Deduplicate by super_name: keep first match (base tier)
  const seen = new Set();
  const deduped = [];
  for (const c of changes) {
    if (!seen.has(c.our)) { seen.add(c.our); deduped.push(c); }
  }
  console.log('Unique models:', deduped.length);

  console.log('\nSample:');
  deduped.slice(0, 10).forEach(c => console.log('  ' + c.our + ' <- ' + c.aa + ': ' + c.sc.map(s => s.t + '=' + s.v).join(', ')));

  if (!APPLY) { console.log('\nDry-run. Use --apply.'); return; }

  const useChanges = typeof deduped !== 'undefined' ? deduped : changes;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let n = 0;
    for (const c of useChanges) {
      for (const s of c.sc) {
        await client.query(
          'INSERT INTO model_scores (datapoint_model_id, source, score_type, score_value, fetched_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (datapoint_model_id, source, score_type) DO UPDATE SET score_value=EXCLUDED.score_value, fetched_at=now()',
          [c.id, SOURCE, s.t, s.v]
        );
        n++;
      }
    }
    await client.query('COMMIT');
    console.log(n, 'scores written (' + useChanges.length + ' unique models).');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

function buildScores(aa) {
  const sc = [];
  if (aa.intelligence) sc.push({ t: 'intelligence', v: aa.intelligence });
  if (aa.price) sc.push({ t: 'price_blended', v: aa.price });
  if (aa.speed) sc.push({ t: 'output_speed', v: aa.speed });
  if (aa.ttft) sc.push({ t: 'latency_ttft', v: aa.ttft });
  if (aa.total) sc.push({ t: 'latency_total', v: aa.total });
  if (aa.context) sc.push({ t: 'context_window', v: aa.context });
  return sc;
}

scrape().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
