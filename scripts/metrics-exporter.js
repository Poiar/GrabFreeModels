#!/usr/bin/env node
/**
 * metrics-exporter.js
 * Serves Prometheus-compatible metrics for GrabFreeModels provider health.
 * Runs a lightweight HTTP listener on the specified port.
 *
 * Usage: node scripts/metrics-exporter.js [--port 9180] [--models path]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let port = 9180;
let modelsFile = process.env.MODELS_FILE_PATH || null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) port = parseInt(args[++i], 10);
  if (args[i] === '--models' && args[i + 1]) modelsFile = args[++i];
}

if (!modelsFile) {
  modelsFile = path.join(__dirname, '..', 'available-models.json');
}

function getMetrics() {
  let json;
  try {
    json = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));
  } catch {
    return '# Error reading models file\n';
  }

  const lines = [];

  lines.push('# HELP model_provider_working Number of working free models per provider');
  lines.push('# TYPE model_provider_working gauge');
  lines.push('# HELP model_provider_total Total number of free models tracked per provider');
  lines.push('# TYPE model_provider_total gauge');
  lines.push('# HELP model_provider_rate_limited Number of rate-limited free models per provider');
  lines.push('# TYPE model_provider_rate_limited gauge');
  lines.push('# HELP model_provider_broken Number of broken free models per provider');
  lines.push('# TYPE model_provider_broken gauge');

  const free = json.models.filter(m => m.is_free);
  const providers = {};
  for (const m of free) {
    if (!providers[m.provider]) providers[m.provider] = [];
    providers[m.provider].push(m);
  }

  for (const [provider, models] of Object.entries(providers)) {
    const working = models.filter(m => m.status.result === 'working').length;
    const rl = models.filter(m => m.status.result === 'rate_limited').length;
    const broken = models.filter(m => m.status.result === 'broken').length;
    const total = models.length;

    lines.push(`model_provider_working{provider="${provider}"} ${working}`);
    lines.push(`model_provider_total{provider="${provider}"} ${total}`);
    lines.push(`model_provider_rate_limited{provider="${provider}"} ${rl}`);
    lines.push(`model_provider_broken{provider="${provider}"} ${broken}`);
  }

  const totalWorking = free.filter(m => m.status.result === 'working').length;
  const totalFree = free.length;
  const ratio = totalFree > 0 ? totalWorking / totalFree : 0;

  lines.push('# HELP model_overall_working_ratio Ratio of working free models to total free models');
  lines.push('# TYPE model_overall_working_ratio gauge');
  lines.push(`model_overall_working_ratio ${ratio}`);

  const testDate = json._test_summary?.date;
  lines.push('# HELP model_test_timestamp Unix timestamp of last validation run');
  lines.push('# TYPE model_test_timestamp gauge');
  try {
    const ts = Math.floor(new Date(testDate).getTime() / 1000);
    lines.push(`model_test_timestamp ${ts}`);
  } catch {
    lines.push('model_test_timestamp 0');
  }

  return lines.join('\n') + '\n';
}

const server = http.createServer((req, res) => {
  const metrics = getMetrics();
  res.writeHead(200, {
    'Content-Type': 'text/plain; version=0.0.4',
    'Content-Length': Buffer.byteLength(metrics),
  });
  res.end(metrics);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Metrics exporter listening on port ${port}`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
