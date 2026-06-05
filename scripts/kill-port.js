#!/usr/bin/env node
/**
 * kill-port.js
 * Kill any process listening on a given port.
 *
 * Usage: node scripts/kill-port.js [--port 5173]
 */

const { execSync } = require('child_process');
const os = require('os');

const args = process.argv.slice(2);
let port = 5173;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) port = parseInt(args[++i], 10);
}

const platform = os.platform();
let pids = [];

try {
  if (platform === 'win32') {
    // Windows: use netstat
    const output = execSync(`netstat -ano | findstr ":${port}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const lines = output.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && !pids.includes(pid)) pids.push(pid);
    }
  } else {
    // Linux/macOS: use lsof
    const output = execSync(`lsof -ti :${port} 2>/dev/null || true`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    pids = output.split('\n').filter((p) => p.trim());
  }
} catch {
  // No process found
}

if (pids.length === 0) {
  console.log(`No process found on port ${port}`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    if (platform === 'win32') {
      const nameOutput = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const name = nameOutput.split(',')[0].replace(/"/g, '').trim();
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      console.log(`Killed process '${name}' (PID ${pid}) on port ${port}`);
    } else {
      execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      console.log(`Killed process (PID ${pid}) on port ${port}`);
    }
  } catch {
    console.log(`Failed to kill PID ${pid}`);
  }
}
