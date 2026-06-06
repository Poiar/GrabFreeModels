#!/usr/bin/env node
/**
 * fetch-external-sources.js
 * Fetches community-maintained free model listings and stores raw + parsed data.
 *
 * Sources:
 *   - cheahjs/free-llm-api-resources (GitHub README with HTML tables + bullet lists)
 *
 * Usage: node scripts/fetch-external-sources.js [--apply]
 *   --apply  : Persist to PostgreSQL (default: dry-run / print summary)
 */

require('dotenv').config();
const https = require('https');
const http = require('http');
const { Pool } = require('pg');
const logger = require('./utils/logger');

const APPLY = process.argv.includes('--apply');

const SOURCES = [
  {
    name: 'free-llm-api-resources',
    url: 'https://raw.githubusercontent.com/cheahjs/free-llm-api-resources/main/README.md',
    type: 'cheahjs-markdown',
  },
];

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    mod
      .get(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          headers: { 'User-Agent': 'GrabFreeModels/1.0' },
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return resolve(httpGet(res.headers.location));
          }
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode} from ${url}`));
            } else {
              resolve(data);
            }
          });
        },
      )
      .on('error', reject);
  });
}

/**
 * Parse cheahjs/free-llm-api-resources README.md into structured model lists.
 * Handles HTML tables, bullet lists, and heading-delimited provider sections.
 */
function parseCheahjs(markdown) {
  const providers = [];

  // Find the free providers section
  const freeSection = markdown.match(/## Free API Providers\n\n([\s\S]*?)(?=## Providers with trial credits|$)/);
  const content = freeSection ? freeSection[1] : markdown;

  // Parse each ### section
  const sectionRegex = /### \[?([^\]]+)\]?(?:\([^)]+\))?\s*\n([\s\S]*?)(?=\n### |\n## |$)/g;
  let match;
  while ((match = sectionRegex.exec(content)) !== null) {
    const providerName = match[1].trim();
    const body = match[2].trim();
    const models = [];

    // Try HTML table first
    const tableMatch = body.match(/<table>([\s\S]*?)<\/table>/i);
    if (tableMatch) {
      const rowRegex = /<tr>([\s\S]*?)<\/tr>/gi;
      let rowMatch;
      let headerSkipped = false;
      while ((rowMatch = rowRegex.exec(tableMatch[1])) !== null) {
        if (!headerSkipped) {
          headerSkipped = true;
          continue; // skip header row
        }
        const tdRegex = /<td>([\s\S]*?)<\/td>/gi;
        const tds = [];
        let tdMatch;
        while ((tdMatch = tdRegex.exec(rowMatch[1])) !== null) {
          let text = tdMatch[1]
            .replace(/<br\s*\/?>/gi, '; ')  // replace <br> with semicolon
            .replace(/<[^>]+>/g, '')        // strip remaining HTML tags
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // strip markdown links
            .replace(/\*\*/g, '')            // strip bold
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();
          tds.push(text);
        }
        if (tds.length >= 1 && tds[0]) {
          models.push({ name: tds[0], limits: tds[1] || '' });
        }
      }
    }

    // If no table found, try bullet list
    if (models.length === 0) {
      const bulletLines = body.match(/^[-*] (.+)$/gm);
      if (bulletLines) {
        for (const bl of bulletLines) {
          let name = bl
            .replace(/^[-*] /, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/\*\*/g, '')
            .trim();
          // Skip non-model lines
          if (name && !name.startsWith('http') && name.length < 200) {
            models.push({ name, limits: '' });
          }
        }
      }
    }

    if (models.length > 0) {
      providers.push({ provider: providerName, models });
    }
  }

  // Also parse trial credits section
  const trialSection = markdown.match(/## Providers with trial credits\n\n([\s\S]*?)$/);
  if (trialSection) {
    const trialRegex = /### \[?([^\]]+)\]?(?:\([^)]+\))?\s*\n([\s\S]*?)(?=\n### |$)/g;
    let tMatch;
    while ((tMatch = trialRegex.exec(trialSection[1])) !== null) {
      const providerName = tMatch[1].trim();
      const body = tMatch[2].trim();
      const creditsMatch = body.match(/\*\*Credits:\*\*\s*(.+)/);
      const modelsMatch = body.match(/\*\*Models:\*\*\s*(.+)/);

      const models = [];
      if (modelsMatch) {
        let modelsText = modelsMatch[1]
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/\*\*/g, '')
          .trim();
        // Could be comma-separated or a single link
        if (modelsText.includes(',')) {
          modelsText.split(',').forEach((m) => {
            const name = m.trim();
            if (name) models.push({ name, limits: '' });
          });
        } else if (modelsText && !modelsText.startsWith('http')) {
          models.push({ name: modelsText, limits: '' });
        }
      }

      providers.push({
        provider: providerName,
        models,
        is_trial: true,
        credits: creditsMatch ? creditsMatch[1].trim() : '',
      });
    }
  }

  return providers;
}

async function fetchSource(source) {
  logger.info(`[${source.name}] Fetching ${source.url}...`);
  const raw = await httpGet(source.url);

  let parsed;
  if (source.type === 'cheahjs-markdown') {
    parsed = parseCheahjs(raw);
  } else {
    throw new Error(`Unknown source type: ${source.type}`);
  }

  const totalModels = parsed.reduce((sum, p) => sum + p.models.length, 0);
  const trialProviders = parsed.filter((p) => p.is_trial).length;
  const freeProviders = parsed.length - trialProviders;

  logger.info(`  Free providers: ${freeProviders}, Trial providers: ${trialProviders}`);
  logger.info(`  Total models:   ${totalModels}`);

  return { raw, parsed, totalModels };
}

(async () => {
  let connectionString = process.env.DATABASE_URL;
  if (
    connectionString &&
    connectionString.includes('sslmode=require') &&
    !connectionString.includes('uselibpqcompat')
  ) {
    connectionString = connectionString.replace(
      'sslmode=require',
      'uselibpqcompat=true&sslmode=require',
    );
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });

  const results = [];

  for (const source of SOURCES) {
    try {
      const result = await fetchSource(source);
      results.push({ source, ...result });
    } catch (e) {
      logger.error(`  FAILED: ${e.message}`);
    }
  }

  logger.info('\n=== Summary ===');
  for (const r of results) {
    logger.info(`  ${r.source.name}: ${r.totalModels} models from ${r.parsed.length} providers`);
  }

  if (!APPLY) {
    logger.info('\nDry-run mode. Use --apply to persist to PostgreSQL.');
    // Print sample of parsed data
    if (results.length > 0) {
      const firstResult = results[0];
      logger.info(`\nSample (first 3 providers from ${firstResult.source.name}):`);
      for (const p of firstResult.parsed.slice(0, 3)) {
        logger.info(`  ${p.provider} (${p.models.length} models, trial=${!!p.is_trial})`);
        for (const m of p.models.slice(0, 5)) {
          logger.info(`    - ${m.name}${m.limits ? ` [${m.limits.substring(0, 60)}]` : ''}`);
        }
        if (p.models.length > 5) logger.info(`    ... and ${p.models.length - 5} more`);
      }
    }
  } else {
    const client = await pool.connect();
    try {
      for (const r of results) {
        await client.query(
          `INSERT INTO external_sources (source_name, source_url, raw_data, models_data, model_count, fetched_at)
           VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT (source_name) DO UPDATE SET
             raw_data = EXCLUDED.raw_data,
             models_data = EXCLUDED.models_data,
             model_count = EXCLUDED.model_count,
             fetched_at = now(),
             updated_at = now()`,
          [
            r.source.name,
            r.source.url,
            JSON.stringify(r.raw),
            JSON.stringify(r.parsed),
            r.totalModels,
          ],
        );
        logger.info(`  Stored ${r.source.name}: ${r.totalModels} models`);
      }
      logger.info('Changes committed to PostgreSQL');
    } catch (err) {
      logger.error(`DB error: ${err.message}`);
      process.exitCode = 1;
    } finally {
      client.release();
    }
  }

  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
