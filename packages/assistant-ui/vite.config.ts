import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite-plus'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const srcRoot = path.resolve(projectRoot, 'src')

const api = process.env.VITE_API_URL || 'http://127.0.0.1:8080'

export default defineConfig({
  root: projectRoot,
  publicDir: path.resolve('..', 'public'),
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${srcRoot}/` }
    ],
  },
  server: {
    port: 3100,
    fs: {
      allow: [projectRoot, path.resolve(projectRoot, '..')],
    },
    proxy: {
      '/ws': {
        target: api.replace('http', 'ws'),
        ws: true,
        changeOrigin: true,
        // Add logging to debug proxy
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[Vite Proxy] Forwarding WebSocket:', req.url, 'to', apiUrl);
          });
        },
      },
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
