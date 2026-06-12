#!/usr/bin/env node
/**
 * fetch-provider-logos.js
 * Fetches provider logos from models.dev/logos/{slug}.svg and saves them
 * to vue-model-manager/public/logos/.
 *
 * Usage: node scripts/fetch-provider-logos.js [--apply] [--force]
 *   --apply  : Download and save logos (default: dry-run)
 *   --force  : Re-download even if logo already exists locally
 */

require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

const LOGOS_DIR = path.join(__dirname, '..', 'vue-model-manager', 'public', 'logos');

/**
 * Maps our datapoint_providers slug -> models.dev logo filename (without .svg).
 * Only needed when the models.dev provider name differs from our slug.
 * The PROVIDER_MAP is for model routing, not brand identity — use a
 * separate explicit map for logos.
 */
const LOGO_NAME_MAP = {
  together: 'togetherai',
  fireworks: 'fireworks-ai',
  cloudflare: 'cloudflare-ai-gateway',
  novitaai: 'novita-ai',
};

function httpsGetBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'GrabFreeModels/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(httpsGetBuffer(res.headers.location));
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({ status: res.statusCode, buffer, size: buffer.length });
        });
      })
      .on('error', reject);
  });
}

(async () => {
  // Connect to DB to get our provider slugs
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });

  try {
    const { rows } = await pool.query('SELECT slug, name FROM datapoint_providers ORDER BY slug');
    console.log(`Found ${rows.length} datapoint providers\n`);

    // Fetch a known-nonexistent logo to get the default placeholder content.
    // Real logos differ from this placeholder; we compare content, not size,
    // because some real logos are smaller than the placeholder.
    let placeholderBuffer = null;
    try {
      const def = await httpsGetBuffer('https://models.dev/logos/__nonexistent_slug__.svg');
      placeholderBuffer = def.buffer;
      console.log(`Default placeholder SVG size: ${placeholderBuffer.length} bytes\n`);
    } catch {
      console.log('Could not determine default placeholder content; using 1500 byte threshold\n');
    }

    let found = 0;
    let skipped = 0;
    let placeholder = 0;
    let notFound = 0;

    for (const row of rows) {
      const { slug, name } = row;

      // Determine the models.dev provider name to use for logo lookup.
      // LOGO_NAME_MAP handles cases where our slug differs from the models.dev
      // provider name; otherwise fall back to the slug itself.
      const mdName = LOGO_NAME_MAP[slug] || slug;

      const url = `https://models.dev/logos/${mdName}.svg`;
      let result;
      try {
        result = await httpsGetBuffer(url);
      } catch {
        console.log(`  [ ] ${slug}: network error fetching ${mdName}.svg`);
        notFound++;
        continue;
      }

      if (result.status !== 200) {
        console.log(`  [ ] ${slug}: HTTP ${result.status}`);
        notFound++;
        continue;
      }

      const isRealLogo = placeholderBuffer
        ? !result.buffer.equals(placeholderBuffer)
        : result.size > 1500;

      if (isRealLogo) {
        if (!APPLY) {
          console.log(`  [✓] ${slug} (${name}) -> ${mdName}.svg (${result.size} bytes)`);
          found++;
          continue;
        }

        const outPath = path.join(LOGOS_DIR, `${slug}.svg`);
        if (!FORCE && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
          console.log(`  [-] ${slug}: already exists (use --force to re-download)`);
          skipped++;
          continue;
        }

        if (!fs.existsSync(LOGOS_DIR)) {
          fs.mkdirSync(LOGOS_DIR, { recursive: true });
        }
        fs.writeFileSync(outPath, result.buffer);
        console.log(`  [✓] ${slug}: saved (${result.size} bytes, from ${mdName}.svg)`);
        found++;
      } else {
        console.log(`  [?] ${slug}: placeholder only (${result.size} bytes)`);
        placeholder++;
      }
    }

    console.log(`\n--- Summary ---`);
    console.log(`  Found:         ${found}`);
    console.log(`  Skipped:       ${skipped}`);
    console.log(`  Placeholder:   ${placeholder}`);
    console.log(`  Not found:     ${notFound}`);
    console.log(`  Total:         ${found + skipped + placeholder + notFound}`);

    if (!APPLY) {
      console.log('\nDry-run. Use --apply to download and save logos.');
    }
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
