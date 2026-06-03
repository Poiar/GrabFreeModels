#!/usr/bin/env node
/**
 * snapshot-openrouter-catalog.js
 *
 * Fetches the complete OpenRouter model catalog (all 343+ models) with full metadata
 * and saves it as a JSON snapshot for analysis and comparison.
 *
 * Captures: id, name, description, context_length, pricing, supported_parameters (→ tools),
 *           architecture (modalities), top_provider, created date
 *
 * Usage: node scripts/snapshot-openrouter-catalog.js
 */

require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');

const AUTH_PATH = path.join(require('os').homedir(), '.local', 'share', 'opencode', 'auth.json');
const OUTPUT = path.join(__dirname, '..', 'data', 'openrouter-catalog.json');

function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : require('http');
    mod.get({ hostname: u.hostname, path: u.pathname + u.search, headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

(async () => {
  const auth = require(AUTH_PATH);
  const key = auth.openrouter?.key;
  if (!key) { console.error('No OpenRouter API key'); process.exit(1); }

  console.log('Fetching OpenRouter catalog...');
  const catalog = await httpGet('https://openrouter.ai/api/v1/models', {
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
  });

  const models = catalog.data || [];
  console.log('Total models:', models.length);

  // Enrich: add is_free flag and tools support
  const enriched = models.map(m => {
    const pricing = m.pricing || {};
    const promptPrice = parseFloat(pricing.prompt || pricing.input || '1');
    const completionPrice = parseFloat(pricing.completion || pricing.output || '1');
    return {
      id: m.id,
      name: m.name || m.id,
      created: m.created ? new Date(m.created * 1000).toISOString() : null,
      context_length: m.context_length,
      max_completion_tokens: m.top_provider?.max_completion_tokens || null,
      pricing: m.pricing,
      is_free: promptPrice === 0 && completionPrice === 0,
      supports_tools: (m.supported_parameters || []).includes('tools'),
      description: (m.description || '').slice(0, 500),
      architecture: m.architecture || null,
      supported_parameters: m.supported_parameters || [],
      top_provider: m.top_provider ? {
        context_length: m.top_provider.context_length,
        max_completion_tokens: m.top_provider.max_completion_tokens,
        is_moderated: m.top_provider.is_moderated,
      } : null,
    };
  });

  const snapshot = {
    scraped_at: new Date().toISOString(),
    total: enriched.length,
    free_count: enriched.filter(m => m.is_free).length,
    by_modality: {},
    models: enriched,
  };

  // Count by modality
  for (const m of enriched) {
    if (m.architecture?.input_modalities) {
      const key = m.architecture.input_modalities.sort().join('+') || 'text';
      snapshot.by_modality[key] = (snapshot.by_modality[key] || 0) + 1;
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(snapshot, null, 2));
  console.log('Saved to', OUTPUT);
  console.log('');

  // Summary
  console.log('Free models:', enriched.filter(m => m.is_free).length);
  console.log('With tools:', enriched.filter(m => m.supports_tools).length);
  console.log('');
  console.log('Modality breakdown:');
  for (const [mod, count] of Object.entries(snapshot.by_modality).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + mod.padEnd(30) + count);
  }

  // Count recently added (last 30 days)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = enriched.filter(m => m.created && new Date(m.created).getTime() > thirtyDaysAgo);
  console.log('\nModels added in last 30 days:', recent.length);
  for (const m of recent.slice(0, 10)) {
    console.log('  ' + m.id + ' (' + (m.created || '').split('T')[0] + ')');
  }
})().catch(e => { console.error(e.message); process.exit(1); });
