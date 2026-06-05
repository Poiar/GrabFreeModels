const { spawn } = require('child_process');

const api = spawn('node', ['-r', 'dotenv/config', 'server/index.js'], {
  stdio: 'inherit',
  cwd: __dirname.replace(/\\scripts$/, ''),
});

const vue = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  cwd: __dirname.replace(/\\scripts$/, '') + '\\vue-model-manager',
  shell: true,
});

function killBoth() {
  api.kill();
  vue.kill();
  process.exit();
}

process.on('SIGINT', killBoth);
process.on('SIGTERM', killBoth);

api.on('exit', () => {
  vue.kill();
  process.exit();
});
vue.on('exit', () => {
  api.kill();
  process.exit();
});
