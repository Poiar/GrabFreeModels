import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { readFile } from 'fs/promises'
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

function availableModelsPlugin() {
  const jsonPath = resolve(__dirname, '..', 'available-models.json')
  return {
    name: 'available-models',
    configureServer(server) {
      server.middlewares.use('/available-models.json', (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405)
          res.end('Method not allowed')
          return
        }
        readFile(jsonPath).then(
          (data) => {
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(data)
          },
          () => {
            res.writeHead(404)
            res.end('Not found')
          }
        )
      })
    },
  }
}

const PORT = parseInt(process.env.VITE_PORT || '5173', 10)

export default defineConfig({
  plugins: [killPortPlugin(PORT), vue(), availableModelsPlugin()],
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
  },
  build: {
    sourcemap: 'hidden',
  },
})
