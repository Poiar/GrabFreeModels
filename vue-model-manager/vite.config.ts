import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { readFile } from 'fs/promises'

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

export default defineConfig({
  plugins: [vue(), availableModelsPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
