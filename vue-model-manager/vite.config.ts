import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { execSync } from 'child_process';

function warnPortPlugin(port: number) {
  let warned = false;
  return {
    name: 'warn-port',
    enforce: 'pre' as const,
    configureServer() {
      if (warned) return;
      warned = true;
      try {
        const output = execSync(`netstat -ano | findstr ":${port}"`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
        });
        if (output.trim()) {
          console.warn(`\n[warn-port] Port ${port} is already in use.`);
          console.warn('[warn-port] Free it manually with: netstat -ano | findstr ":PORT"');
          console.warn('[warn-port] Then: taskkill /PID <pid> /F\n');
        }
      } catch {
        /* no process found on that port — OK */
      }
    },
  };
}

const PORT = parseInt(process.env.VITE_PORT || '5173', 10);

export default defineConfig({
  plugins: [warnPortPlugin(PORT), vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: PORT,
    strictPort: true,
    open: true,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: 'hidden',
  },
});
