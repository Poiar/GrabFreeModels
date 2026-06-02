import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { execSync } from 'child_process'

function killPortPlugin(port: number) {
  let killed = false
  return {
    name: 'kill-port',
    enforce: 'pre' as const,
    configureServer() {
      if (killed) return
      killed = true
      try {
        const output = execSync(`netstat -ano | findstr ":${port}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
        const pids = new Set<string>()
        for (const line of output.split('\n')) {
          const parts = line.trim().split(/\s+/)
          const pid = parts[parts.length - 1]
          if (pid) pids.add(pid)
        }
        for (const pid of pids) {
          try {
            execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
            console.log(`[kill-port] Killed process ${pid} on port ${port}`)
          } catch { /* ignore */ }
        }
      } catch {
        // no process found on that port
      }
    },
  }
}

const PORT = parseInt(process.env.VITE_PORT || '5173', 10)

export default defineConfig({
  plugins: [killPortPlugin(PORT), vue()],
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
})
