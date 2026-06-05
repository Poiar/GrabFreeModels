const { spawn } = require('child_process');

// Spawn the Express API server
const api = spawn('node', ['-r', 'dotenv/config', 'server/index.js'], {
  stdio: 'inherit',
  cwd: __dirname.replace(/\\scripts$/, ''),
});

// Spawn the Vite dev server for the Vue SPA
const vue = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  cwd: __dirname.replace(/\\scripts$/, '') + '\\vue-model-manager',
  shell: true,
});

// Helper to shut down both child processes and then exit this script
function killBoth() {
  api.kill();
  vue.kill();
  process.exit();
}

process.on('SIGINT', killBoth);
process.on('SIGTERM', killBoth);

// Track how many child processes are still running. When both have exited, finish this script.
let remaining = 2;
function childExited(name, code, signal) {
  console.log(`${name} exited (code: ${code}, signal: ${signal})`);
  remaining -= 1;
  if (remaining === 0) {
    process.exit();
  }
}

api.on('exit', (code, signal) => childExited('API', code, signal));
vue.on('exit', (code, signal) => childExited('Vue', code, signal));

// Keep the parent process alive even if the children detach (e.g., npm uses a shell).
process.stdin.resume();
