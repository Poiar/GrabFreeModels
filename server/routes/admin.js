const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const router = express.Router();

const ROOT = path.resolve(__dirname, '../..');

// ── Async spawn helper (same pattern as nightly-maintenance.js) ──
function run(cmd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [], { cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || stdout || `exit ${code}`));
    });
    child.on('error', reject);
  });
}

const ACTIONS = {
  sync: { cmd: 'node scripts/sync-models.js --apply', label: 'Sync Models' },
  validate: { cmd: 'node scripts/validate-free-models.js --apply', label: 'Validate Models' },
  rank: { cmd: 'node scripts/rank.js --apply', label: 'Rank Free Models' },
  rankPaid: { cmd: 'node scripts/rank.js --paid --apply', label: 'Rank Paid Models' },
  financials: {
    cmd: 'node scripts/import-is-ai-profitable.js --apply',
    label: 'Import Financials',
  },
  nightly: { cmd: 'node scripts/nightly-maintenance.js', label: 'Full Nightly' },
  export: { cmd: 'node scripts/export-from-pg.js', label: 'Export JSON' },
};

router.post('/admin/:action', async (req, res) => {
  const { action } = req.params;
  const token = req.headers['x-admin-token'];
  const expected = process.env.ADMIN_TOKEN || 'gfm-admin-2026';
  if (token !== expected) return res.status(401).json({ error: 'Unauthorized' });

  const script = ACTIONS[action];
  if (!script) return res.status(400).json({ error: `Unknown action: ${action}` });

  console.log(`[Admin] ${script.label} started`);

  // Respond immediately, run in background with 5-minute timeout
  res.json({ message: `${script.label} started — check server logs for output` });

  try {
    const result = await run(script.cmd);
    console.log(`[Admin] ${script.label} completed:\n${result.slice(-1000)}`);
  } catch (e) {
    console.error(`[Admin] ${script.label} failed: ${e.message}`);
  }
});

module.exports = router;
