#!/usr/bin/env node
/**
 * validate-new-models.js
 * Tests only newly-synced free models (status_result IS NULL) against their APIs.
 * Avoids re-testing all 182 models — finishes in seconds not minutes.
 *
 * Usage: node scripts/validate-new-models.js [--apply]
 */

require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

const APPLY = process.argv.includes('--apply');

// Simple chat completion call via provider API
async function testModel(model) {
  const { full_id } = model;
  const provider = model.provider_slug;

  // Build the right config per provider
  const configs = {
    openrouter: {
      baseUrl: 'https://openrouter.ai/api/v1',
      modelId: full_id.replace('openrouter/', ''),
    },
    google: {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      modelId: full_id.replace('google/', ''),
    },
    deepseek: { baseUrl: 'https://api.deepseek.com/v1', modelId: full_id.replace('deepseek/', '') },
    nvidia: {
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      modelId: full_id.replace('nvidia/', ''),
    },
    cerebras: { baseUrl: 'https://api.cerebras.ai/v1', modelId: full_id.replace('cerebras/', '') },
    groq: { baseUrl: 'https://api.groq.com/openai/v1', modelId: full_id.replace('groq/', '') },
  };

  const cfg = configs[provider];
  if (!cfg) return { status: 'untested', detail: `No test config for provider: ${provider}` };

  const authPath = require('path').join(
    process.env.USERPROFILE,
    '.local',
    'share',
    'opencode',
    'auth.json',
  );
  let auth = {};
  try {
    auth = JSON.parse(require('fs').readFileSync(authPath, 'utf8'));
  } catch {}

  const keyMap = {
    openrouter: 'openrouter',
    google: 'google',
    deepseek: 'deepseek',
    nvidia: 'nvidia',
    cerebras: 'cerebras',
    groq: 'groq',
    huggingface: 'huggingface',
  };
  const apiKey = auth[keyMap[provider]];

  if (!apiKey) return { status: 'untested', detail: `No API key for ${provider}` };

  const body =
    provider === 'google'
      ? JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] })
      : JSON.stringify({
          model: cfg.modelId,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 10,
        });

  try {
    const url =
      provider === 'google'
        ? `${cfg.baseUrl}/models/${cfg.modelId}:generateContent?key=${apiKey}`
        : cfg.baseUrl + '/chat/completions';

    const headers =
      provider === 'google'
        ? { 'Content-Type': 'application/json' }
        : { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return { status: 'working', detail: null };
    if (res.status === 429) return { status: 'rate_limited', detail: '429' };
    if (res.status >= 500) return { status: 'rate_limited', detail: String(res.status) };
    return { status: 'rate_limited', detail: String(res.status) };
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError')
      return { status: 'rate_limited', detail: 'timeout' };
    return { status: 'rate_limited', detail: err.message?.slice(0, 100) };
  }
}

(async () => {
  const client = await pool.connect();
  try {
    // Find untested free models
    const { rows: untested } = await client.query(`
      SELECT dm.id, dm.full_id, dm.datapoint_provider_id, dp.slug AS provider_slug
      FROM datapoint_models dm
      JOIN datapoint_providers dp ON dp.id = dm.datapoint_provider_id
      WHERE dm.is_free = true AND dm.is_removed = false AND dm.status_result = 'untested'
      ORDER BY dm.full_id
    `);

    console.log(`Untested free models: ${untested.length}\n`);

    if (untested.length === 0) {
      console.log('Nothing to test.');
      await client.end();
      return;
    }

    let working = 0,
      rateLimited = 0,
      skipped = 0;

    for (const m of untested) {
      const result = await testModel(m);
      const icon = result.status === 'working' ? '✓' : result.status === 'rate_limited' ? '~' : '?';
      console.log(
        `  ${icon} ${m.full_id} → ${result.status}${result.detail ? ' (' + result.detail + ')' : ''}`,
      );

      if (result.status === 'working') working++;
      else if (result.status === 'rate_limited') rateLimited++;

      if (APPLY) {
        const today = new Date().toISOString().split('T')[0];
        await client.query(
          'UPDATE datapoint_models SET status_result = $1, status_tested = $2, status_detail = $3 WHERE id = $4',
          [result.status, today, result.detail, m.id],
        );
      }
    }

    console.log(`\nResults: ${working} working, ${rateLimited} rate_limited, ${skipped} skipped`);
    if (!APPLY) console.log('\nDry-run. Use --apply to write.');
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
