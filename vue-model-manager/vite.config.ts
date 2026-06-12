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
        // Extract PIDs from LISTENING lines and kill them
        const lines = output.trim().split('\n').filter(l => l.includes('LISTENING'));
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid)) {
            try {
              execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
              console.log(`[warn-port] Killed PID ${pid} on port ${port}`);
            } catch {
              console.warn(`[warn-port] Could not kill PID ${pid} on port ${port}`);
            }
          }
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
