#!/usr/bin/env node
/**
 * build-readme.js — Updates the auto-generated sections in README.md from the codebase.
 *
 * Only replaces sections between <!-- AUTO:name --> and <!-- /AUTO --> markers.
 * Everything else is left untouched.
 *
 * Usage: node scripts/build-readme.js [--write]
 *   Default: dry-run (prints diff)
 *   --write:  update README.md in-place
 */

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const README_PATH = path.join(REPO, 'README.md');
const WRITE = process.argv.includes('--write');

// ── Format with Prettier if available ──
function formatWithPrettier(content, filepath) {
  try {
    const { execSync } = require('child_process');
    return execSync(`npx prettier --stdin-filepath "${filepath}"`, {
      input: content,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: REPO,
      timeout: 10000,
    });
  } catch {
    // Prettier not available or failed — return unformatted
    return content;
  }
}

// ── Section builders ──

function buildPipelineSummary() {
  const src = fs.readFileSync(path.join(REPO, 'scripts', 'nightly-maintenance.js'), 'utf8');
  const match = src.match(/const STEP_NAMES = \[([\s\S]*?)\];/);
  if (!match) return '';
  const steps = match[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith("'"))
    .map((l) => l.replace(/^'|,'?$/g, '').replace(/'$/, ''));
  const critical = steps.filter(
    (s) => s === 'validate' || s === 're-rank' || s === 'commit-push',
  ).length;
  return `Every model gets a \`super_model\` (canonical identity) with per-provider \`datapoint_model\` rows. The nightly pipeline (${steps.length} steps, ${critical} critical) syncs free and paid models, validates free endpoints, re-ranks by role, imports company financials, snapshots the DB, and commits to git.\n`;
}

function buildScriptsList() {
  const SCRIPTS = [
    ['build-models-data.js', 'Shared data builder (API + all scripts)'],
    ['build-organizations.js', 'Unified Organization builder (creator + provider)'],
    ['sync-models.js', 'Fetch from 18+ providers, diff vs DB'],
    ['validate-free-models.js', 'Test free model endpoints against live APIs'],
    ['rank.js', 'Deterministic role ranking (free + paid, --paid)'],
    ['import-is-ai-profitable.js', 'Scrape AI company financials from isaiprofitable.com'],
    ['import-modelsdev.js', 'Upsert super_models from models.dev'],
    ['import-modelsdev-backfill.js', 'Fuzzy-match existing supers to models.dev'],
    ['import-external-models.js', 'Import from external model registries'],
    ['import-modelsdev-benchmarks.js', 'Import benchmark scores from models.dev'],
    ['fetch-modelsdev-models.js', 'Fetch models.dev catalog'],
    ['fetch-external-sources.js', 'Fetch community source lists'],
    ['fetch-huggingface-hub.js', 'Scrape HF Hub for free inference models'],
    ['fetch-openllm-leaderboard.js', 'Fetch Open LLM Leaderboard data'],
    ['nightly-maintenance.js', 'Full STEPS-step nightly pipeline orchestrator'],
    ['nightly-summary.js', 'Text summary for Slack/Discord delivery'],
    ['backfill-base-models.js', 'Detect fine-tune lineage via substring matching'],
    ['backfill-base-creators.js', 'Detect base creators for derived models'],
    ['inherit-families.js', 'Walk base_model chains to inherit family assignments'],
    ['backfill-context.js', 'Backfill missing context lengths'],
    ['check-degradation.js', 'Detect latency/failure rate regressions'],
    ['check-rankings.js', 'Sanity-check role rankings'],
    ['diff-rankings.js', 'Compare rankings across runs'],
    ['export-from-pg.js', 'Export PG → JSON snapshot'],
    ['cleanup-snapshots.js', 'Rotate old snapshots'],
    ['generate-dashboard.js', 'HTML dashboard of provider health'],
    ['metrics-exporter.js', 'Prometheus metrics endpoint (:9180)'],
    ['model-summary.js', 'Text overview of model counts'],
  ];

  // Inject live step count
  const stepCount = (() => {
    try {
      const src = fs.readFileSync(path.join(REPO, 'scripts', 'nightly-maintenance.js'), 'utf8');
      const m = src.match(/const STEP_NAMES = \[([\s\S]*?)\];/);
      return m ? m[1].split('\n').filter((l) => l.trim().startsWith("'")).length : '?';
    } catch {
      return '?';
    }
  })();

  let out =
    '```\nscripts/                         # Node.js pipeline scripts (CommonJS)\n  builders/                       #   Decomposed data builder modules\n';
  for (const [name, desc] of SCRIPTS) {
    const d = desc.replace('STEPS', String(stepCount));
    out += `  ${name.padEnd(30)} #   ${d}\n`;
  }
  out += 'server/                          # Express API (port 3001)\n';
  out += '  db.js                          #   Neon-aware Postgres pool (max 3, 60s keepalive)\n';
  out +=
    '  routes/data.js                 #   GET /api/data, /api/data/paid, /api/rankings, etc.\n';
  out += 'db/                              # PostgreSQL schema v2\n';
  out += '  schema.sql                     #   Canonical schema + seed data\n';
  out += '  migrations/                    #   Ordered schema migrations\n';
  out += 'vue-model-manager/               # Vue 3 + Pinia frontend (ESM/TypeScript)\n';
  out += 'snapshots/                       # Timestamped JSON exports\n';
  out += '```\n';
  return out;
}

function buildRoutesTable() {
  const src = fs.readFileSync(path.join(REPO, 'vue-model-manager', 'src', 'router.ts'), 'utf8');

  // Route descriptions — manually curated (router meta.title doesn't carry enough detail)
  const DESCRIPTIONS = {
    '/': 'Filterable grid of all free model datapoints by provider/status',
    '/dashboard': 'Hero stats, AI financials, top ranked/scored, validation, flaky',
    '/supermodels': 'Card list grouped by canonical model',
    '/supermodel/:slug': 'Single super model with provider instances',
    '/model/:slug': 'Single model with validation bar, rankings, benchmarks',
    '/creators': 'Models grouped by creator/lab',
    '/creator/:id': 'Single creator with all their models',
    '/org/:id': 'Unified organization page (creator + provider facets)',
    '/families': 'Models grouped by lineage family',
    '/family/:name': 'Single family with all member models',
    '/derivatives': 'Fine-tuned/derived models grouped by method',
    '/derivative/:id': 'Single derivative with base model chain',
    '/base-models': 'Foundation models ranked by derivative count',
    '/base-model/:name': 'Base model with its derivatives',
    '/providers': 'Provider list with health indicators',
    '/provider/:slug': 'Single provider with all instances, latencies, failures',
    '/rankings': 'Free/paid toggle, per-role rankings with score breakdown',
    '/compare': 'Two-model side-by-side radar, capabilities, benchmarks, MD copy',
    '/compare-providers': 'Side-by-side provider comparison',
    '/benchmarks': 'Intelligence/speed/cost benchmark leaderboard',
    '/scores': 'Raw model scores explorer',
    '/picker': '4-step wizard: Task → Capabilities → Context → Results',
    '/advanced-search': 'Faceted search across all dimensions',
    '/providers/status': 'Grid of provider health with donut charts',
    '/rate-limits': 'Compare rate limits across providers',
    '/lineage': 'Interactive model family tree',
    '/playground': 'Test models in-browser',
    '/tags': 'Browse models by capability tags',
    '/activity': 'Recently tested and updated models',
    '/admin': 'Trigger pipeline tasks from the browser (auth required)',
    '/providers/onboarding': 'Provider onboarding checklist/wizard',
  };

  // Parse routes from router.ts
  const routePattern = /\{\s*path:\s*'([^']+)',\s*name:\s*'([^']+)'/g;
  const routes = [];
  let match;
  while ((match = routePattern.exec(src)) !== null) {
    routes.push({ path: match[1], name: match[2] });
  }

  // Build table
  let out =
    '| Route               | View                | Description                                                    |\n';
  out +=
    '| ------------------- | ------------------- | -------------------------------------------------------------- |\n';

  for (const r of routes) {
    const hashPath = '#/' + (r.path === '/' ? '' : r.path.replace(/^\//, ''));
    const desc = DESCRIPTIONS[r.path] || r.name;
    const paddedPath = ('`' + hashPath + '`').padEnd(22);
    const paddedName = r.name.padEnd(21);
    out += `| ${paddedPath}| ${paddedName}| ${desc.padEnd(62)}|\n`;
  }

  return out;
}

// ── Section registry ──

const SECTIONS = {
  'pipeline-summary': buildPipelineSummary,
  'scripts-list': buildScriptsList,
  'routes-table': buildRoutesTable,
};

// ── Main ──

function buildReadme() {
  let template = fs.readFileSync(README_PATH, 'utf8');

  for (const [name, builder] of Object.entries(SECTIONS)) {
    const marker = `<!-- AUTO:${name} -->`;
    const endMarker = `<!-- /AUTO -->`;
    const startIdx = template.indexOf(marker);
    const endIdx = template.indexOf(endMarker, startIdx);

    if (startIdx === -1) {
      console.log(`  ⚠ No <!-- AUTO:${name} --> marker found`);
      continue;
    }
    if (endIdx === -1) {
      console.log(`  ⚠ No <!-- /AUTO --> after <!-- AUTO:${name} -->`);
      continue;
    }

    const newContent = builder();
    template =
      template.slice(0, startIdx + marker.length) +
      '\n' +
      newContent.trimEnd() +
      '\n' +
      template.slice(endIdx);
  }

  // Format the full output through prettier so comparison is stable
  const formatted = formatWithPrettier(template, 'README.md');
  const current = fs.readFileSync(README_PATH, 'utf8');
  return { content: formatted, changed: formatted !== current };
}

const { content, changed } = buildReadme();

if (!changed) {
  console.log('README.md is up to date — all auto sections match the codebase.');
} else {
  console.log('README.md auto sections updated.');
}

if (WRITE) {
  fs.writeFileSync(README_PATH, content);
  console.log('✓ README.md written (prettier-formatted).');
} else if (changed) {
  console.log('[dry-run] README would be updated. Use --write to apply.\n');
  const oldLines = fs.readFileSync(README_PATH, 'utf8').split('\n');
  const newLines = content.split('\n');
  let diffCount = 0;
  for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
    if (oldLines[i] !== newLines[i]) {
      if (diffCount++ > 60) {
        console.log('... (truncated)');
        break;
      }
      if (oldLines[i] !== undefined) console.log(`- ${oldLines[i]}`);
      if (newLines[i] !== undefined) console.log(`+ ${newLines[i]}`);
    }
  }
}
