import os

content = '''#!/usr/bin/env node
/**
 * scrape-artificial-analysis.js
 *
 * Scrapes the Artificial Analysis LLM leaderboard HTML page,
 * parses the embedded model data, and stores scores in model_scores.
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
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

function extractModelsFromHTML(html) {
  // AA embeds data in window.__NEXT_DATA__ as JSON
  const match = html.match(/window\\.__NEXT_DATA__\\s*=\\s*(\{.+?\\});/s)
    || html.match(/self\\.__next_f\\.push\\(\\[1,\\s*"([\\s\\S]+?)"\\]\\)/s);
  
  if (!match) {
    // Fallback: try to extract from visible table rows
    console.log('WARNING: No __NEXT_DATA__ found, trying table extraction');
    return extractFromTable(html);
  }

  try {
    const jsonStr = match[1].replace(/\\\\u002F/g, '/');
    const data = JSON.parse(jsonStr);
    // Navigate Next.js data structure
    const pageProps = data?.props?.pageProps || data?.pageProps;
    const models = pageProps?.models || pageProps?.data?.models || [];
    
    return models.map(m => ({
      name: m.name || m.model || m.model_name || '',
      creator: m.creator || m.provider || m.Model || '',
      intelligence: parseFloat(m.intelligence_index || m.intelligenceIndex || m.intelligence || m['Intelligence Index']) || null,
      blendedPrice: parseFloat((m.blended_price || m.blendedPrice || m['BlendedUSD/1M Tokens'] || '').replace('$', '').replace(',', '')) || null,
      outputSpeed: parseFloat(m.output_speed || m.outputSpeed || m['MedianTokens/s']) || null,
      latencyTtft: parseFloat(m.latency_ttft || m.latencyTtft || m['LatencyFirst Chunk (s)'] || m['Latency First Chunk (s)']) || null,
      latencyTotal: parseFloat(m.latency_total || m.latencyTotal || m['TotalResponse (s)'] || m['Total Response (s)']) || null,
      contextWindow: parseFloat((m.context_window || m.contextWindow || m['Context Window'] || '').replace(/,/g, '')) || null,
    })).filter(m => m.name && !isNaN(m.intelligence));
  } catch (e) {
    console.log('JSON parse failed:', e.message);
    return extractFromTable(html);
  }
}

function extractFromTable(html) {
  // Extract from HTML table rows
  const models = [];
  // Look for table rows with model data
  const rowPattern = /<tr[^>]*>.*?<td[^>]*>(.*?<\\/td>.*?<\\/td>.*?<\\/td>.*?<\\/td>.*?<\\/td>.*?<\\/td>.*?<\\/td>.*?<\\/td>.*?)<\\/tr>/gs;
  let match;
  while ((match = rowPattern.exec(html)) !== null) {
    const cells = match[1].replace(/<[^>]+>/g, ' ').trim().split(/\\s+/);
    if (cells.length >= 4) {
      models.push({
        name: cells[0] || '',
        creator: cells[1] || '',
        intelligence: parseFloat(cells[2]) || null,
        blendedPrice: parseFloat((cells[3] || '').replace('$', '')) || null,
        outputSpeed: parseFloat(cells[4]) || null,
        latencyTtft: parseFloat(cells[5]) || null,
        latencyTotal: parseFloat(cells[6]) || null,
        contextWindow: parseFloat((cells[7] || '').replace(/,/g, '')) || null,
      });
    }
  }
  return models.filter(m => m.name && !isNaN(m.intelligence));
}

function normalizeName(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/instruct|chat|preview|v\\d+|free|turbo|lite|high|medium|low|max|xl|xxl|small|base|nonreasoning/g, '')
    .replace(/(google|anthropic|openai|meta|nvidia|xai|alibaba|minimax|xiaomi|zai|mistral|cohere|deepseek|ibm|amazon|bytedance|baidu|tencent|lg|stepfun)/, '')
    .trim();
}

async function scrape() {
  console.log('Fetching Artificial Analysis leaderboard...');

  // Fetch the main leaderboard page
  const resp = await fetchURL('https://artificialanalysis.ai/leaderboards/models');
  if (resp.status !== 200) {
    console.error('ERROR: HTTP', resp.status);
    process.exit(1);
  }

  let models = extractModelsFromHTML(resp.body);

  if (models.length === 0) {
    console.log('ERROR: No models extracted from page');
    console.log('The page structure may have changed.');
    process.exit(1);
  }

  console.log('Extracted', models.length, 'models from Artificial Analysis');

  // Get our models
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

  console.log('Matched:', matched + '/' + models.length);

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
    console.log(n, 'scores written (' + changes.length + ' models).');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

scrape().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
'''

with open('scripts/scrape-artificial-analysis.js', 'w', encoding='utf-8', newline='') as f:
    f.write(content)
print('Updated scraper:', len(content), 'bytes');
