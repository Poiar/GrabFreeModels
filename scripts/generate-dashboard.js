#!/usr/bin/env node
/**
 * generate-dashboard.js
 * Creates a simple HTML dashboard showing provider health and current rankings.
 * Providers listed in _provider_usage for the current month are greyed out.
 *
 * Usage: node scripts/generate-dashboard.js [--output path/to/dashboard.html]
 */

const fs = require('fs');
const path = require('path');
const loadModels = require('./load-models');

(async () => {
  const args = process.argv.slice(2);
  let outputPath = path.join(__dirname, '..', 'dashboard.html');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) outputPath = args[++i];
  }

  const data = await loadModels();

  const currentMonth = new Date().toISOString().slice(0, 7);
  const usedUpProviders = [];

  if (data._provider_usage) {
    for (const [key, entry] of Object.entries(data._provider_usage)) {
      if (key === 'description') continue;
      if (entry && entry.month === currentMonth) {
        usedUpProviders.push(key);
      }
    }
  }

  const providerHealth = {};
  for (const m of data.models) {
    if (!m.is_free) continue;
    if (!providerHealth[m.provider]) {
      providerHealth[m.provider] = { working: 0, rate_limited: 0, broken: 0, total: 0 };
    }
    const h = providerHealth[m.provider];
    h.total++;
    if (m.status.result === 'working') h.working++;
    else if (m.status.result === 'rate_limited') h.rate_limited++;
    else if (m.status.result === 'broken') h.broken++;
  }

  let provRows = '';
  for (const name of Object.keys(providerHealth).sort()) {
    const health = providerHealth[name];
    const isUsedUp = usedUpProviders.includes(name);
    const style = isUsedUp ? " style='background:#f0f0f0;color:#999;text-decoration:line-through'" : '';
    const badge = isUsedUp ? ` <span title='Used up for ${currentMonth}'>⚠</span>` : '';
    provRows += `<tr${style}><td>${name}${badge}</td><td>${health.total}</td><td>${health.working}</td><td>${health.rate_limited}</td><td>${health.broken}</td></tr>\n`;
  }

  const provTable = [
    '<h2>Provider Health</h2>',
    `<p style="font-size:0.85em;color:#666">Strikethrough = used up for ${currentMonth} (see _provider_usage)</p>`,
    "<table border='1' cellpadding='4'><tr><th>Provider</th><th>Total</th><th>Working</th><th>Rate-Limited</th><th>Broken</th></tr>",
    provRows,
    '</table>',
  ].join('\n');

  let roleTables = '';
  const rankings = data._role_rankings || {};
  for (const [role, ids] of Object.entries(rankings)) {
    if (role === 'description' || !Array.isArray(ids)) continue;
    let rows = '';
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const provider = id.split('/')[0];
      const isUsedUp = usedUpProviders.includes(provider);
      const style = isUsedUp ? " style='color:#999;text-decoration:line-through'" : '';
      rows += `<tr${style}><td>${i + 1}</td><td>${id}</td></tr>\n`;
    }
    roleTables += `<h3>${role} (${ids.length})</h3><table border='1' cellpadding='4'><tr><th>#</th><th>Model ID</th></tr>${rows}</table>\n`;
  }

  let usageSection = '';
  if (usedUpProviders.length > 0) {
    let usageRows = '';
    for (const p of usedUpProviders) {
      const reason = data._provider_usage[p]?.reason || '';
      usageRows += `<tr><td>${p}</td><td>${reason}</td></tr>\n`;
    }
    usageSection = [
      `<h2>Used-Up Providers (${currentMonth})</h2>`,
      "<table border='1' cellpadding='4'><tr><th>Provider</th><th>Reason</th></tr>",
      usageRows,
      '</table>',
    ].join('\n');
  }

  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Free Model Dashboard</title></head>
<body>
<h1>Free Model Dashboard</h1>
<p style="font-size:0.85em;color:#666">Generated ${now}</p>
${provTable}
${usageSection}
<h2>Role Rankings</h2>
${roleTables}
</body>
</html>`;

  fs.writeFileSync(outputPath, html, 'utf8');
  console.log(`Dashboard written to ${outputPath}`);
})().catch(e => { console.error(e.message); process.exit(1); });
