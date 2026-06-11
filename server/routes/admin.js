const express = require('express');
const { execSync } = require('child_process');
const path = require('path');
const router = express.Router();

const ROOT = path.resolve(__dirname, '../..');

router.post('/admin/:action', async (req, res) => {
  const { action } = req.params;
  const token = req.headers['x-admin-token'];
  if (token !== 'gfm-admin-2026') return res.status(401).json({ error: 'Unauthorized' });

  const scripts = {
    sync: { cmd: 'node scripts/sync-models.js --apply', label: 'Sync Models' },
    validate: { cmd: 'node scripts/validate-free-models.js --apply', label: 'Validate Models' },
    rank: { cmd: 'node scripts/re-rank.js', label: 'Re-rank' },
    nightly: { cmd: 'node scripts/nightly-maintenance.js', label: 'Full Nightly' },
    export: { cmd: 'node scripts/load-models.js > available-models.json', label: 'Export JSON' },
  };

  if (!scripts[action]) return res.status(400).json({ error: 'Unknown action: ' + action });

  res.json({ message: `${scripts[action].label} started — check server logs for output` });

  // Run async so the response isn't blocked
  try {
    const result = execSync(scripts[action].cmd, { cwd: ROOT, timeout: 300000, encoding: 'utf8' });
    console.log(`[Admin] ${scripts[action].label} completed:\n${result.slice(-500)}`);
  } catch (e) {
    console.error(`[Admin] ${scripts[action].label} failed: ${e.message}`);
  }
});

module.exports = router;
