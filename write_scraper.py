import os

content = '''#!/usr/bin/env node
/**
 * scrape-artificial-analysis.js
 *
 * Scrapes the Artificial Analysis LLM leaderboard and stores scores
 * in the model_scores table.
 */

const https = require('https');
const http = require('http');
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');
const connectionString = process.env.DATABASE_URL;
const pool = connectionString
  ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
  : new Pool({ host: process.env.PGHOST || 'localhost', port: parseInt(process.env.PGPORT || '5432'), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE });

const SOURCE = 'artificial_analysis';

function fetchURL(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\"' && !inQuotes) { inQuotes = true; continue; }
    if (ch === '\"' && inQuotes) { inQuotes = false; continue; }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

function parseCSV(csv) {
  const lines = csv.trim().split('\\n');
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/\"/g, ''));
  const models = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]).map(c => c.trim().replace(/\"/g, ''));
    const row = {};
    headers.forEach((h, idx) => row[h] = cols[idx] || '');
    const name = row['Model'] || row['model'] || '';
    if (!name) continue;
    models.push({
      name,
      creator: row['Creator'] || row['creator'] || '',
      intelligence: parseFloat(row['Artificial Analysis Intelligence Index'] || row['Intelligence']) || null,
      blendedPrice: parseFloat((row['BlendedUSD/1M Tokens'] || row['Price'] || '').replace('$', '').replace(',', '')) || null,
      outputSpeed: parseFloat(row['MedianTokens/s'] || row['Speed']) || null,
      latencyTtft: parseFloat(row['Latency First Chunk (s)'] || row['LatencyFirst Chunk (s)'] || row['TTFT']) || null,
      latencyTotal: parseFloat(row['Total Response (s)'] || row['TotalResponse (s)'] || row['Total Latency']) || null,
      contextWindow: parseFloat((row['Context Window'] || row['Context'] || '').replace(/,/g, '')) || null,
    });
  }
  return models;
}

function normalizeName(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/instruct|chat|preview|v\\d+|free|turbo|lite|high|medium|low|max|xl|xxl|small|base/g, '')
    .replace(/(google|anthropic|openai|meta|nvidia|xai|alibaba|minimax|xiaomi|zai|mistral|cohere|deepseek)/, '')
    .trim();
}

async function scrape() {
  console.log('Fetching Artificial Analysis leaderboard...');
  let models = [];
  try {
    const resp = await fetchURL('https://artificialanalysis.ai/api/download/llm-leaderboard.csv');
    if (resp.status === 200 && resp.body.includes(',')) {
      models = parseCSV(resp.body);
      console.log('Got CSV: ' + models.length + ' models');
    }
  } catch (e) {
    console.log('CSV failed: ' + e.message);
  }

  if (models.length === 0) {
    console.log('ERROR: No data from Artifical Analysis');
    process.exit(1);
  }

  const { rows: ourModels } = await pool.query(
    "SELECT dm.id, dm.full_id, mm.name AS master_name FROM datapoint_models dm JOIN master_models mm ON mm.id = dm.master_model_id WHERE dm.is_free = true AND dm.status_result = 'working' AND dm.is_removed = false"
  );

  let matched = 0;
  const changes = [];

  for (const aa of models) {
    if (!aa.name) continue;
    const aaNorm = normalizeName(aa.name);
    let bestMatch = null;
    let bestScore = 0;
    for (const m of ourModels) {
      const ourNorm = normalizeName(m.master_name);
      if (aaNorm === ourNorm) { bestMatch = m; bestScore = 100; break; }
      if (aaNorm.includes(ourNorm) || ourNorm.includes(aaNorm)) {
        const score = Math.min(aaNorm.length, ourNorm.length) / Math.max(aaNorm.length, ourNorm.length);
        if (score > bestScore && score > 0.4) { bestScore = score; bestMatch = m; }
      }
    }
    if (bestMatch) {
      matched++;
      const scores = [];
      if (aa.intelligence != null) scores.push({ t: 'intelligence', v: aa.intelligence });
      if (aa.blendedPrice != null) scores.push({ t: 'price_blended', v: aa.blendedPrice });
      if (aa.outputSpeed != null) scores.push({ t: 'output_speed', v: aa.outputSpeed });
      if (aa.latencyTtft != null) scores.push({ t: 'latency_ttft', v: aa.latencyTtft });
      if (aa.latencyTotal != null) scores.push({ t: 'latency_total', v: aa.latencyTotal });
      if (aa.contextWindow != null) scores.push({ t: 'context_window', v: aa.contextWindow });
      if (scores.length > 0) changes.push({ id: bestMatch.id, aaName: aa.name, ourName: bestMatch.master_name, scores });
    }
  }

  console.log('Matched: ' + matched + '/' + models.length);
  if (changes.length === 0) { console.log('No changes.'); return; }

  console.log('\\nSample (first 10):');
  changes.slice(0, 10).forEach(c => console.log('  ' + c.ourName + ' <- ' + c.aaName + ': ' + c.scores.map(s => s.t + '=' + s.v).join(', ')));

  if (!APPLY) { console.log('\\nDry-run. Use --apply.'); return; }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let n = 0;
    for (const c of changes) {
      for (const s of c.scores) {
        await client.query(
          'INSERT INTO model_scores (datapoint_model_id, source, score_type, score_value, fetched_at) VALUES (, , , , now()) ON CONFLICT (datapoint_model_id, source, score_type) DO UPDATE SET score_value = EXCLUDED.score_value, fetched_at = now()',
          [c.id, SOURCE, s.t, s.v]
        );
        n++;
      }
    }
    await client.query('COMMIT');
    console.log(n + ' scores written (' + changes.length + ' models).');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

scrape().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
'''

with open('scripts/scrape-artificial-analysis.js', 'w', newline='', encoding='utf-8') as f:
    f.write(content)
print('Written', len(content), 'bytes')
