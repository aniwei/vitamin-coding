import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite-plus'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const srcRoot = path.resolve(projectRoot, 'src')

export default defineConfig({
  root: projectRoot,
  publicDir: path.resolve('..', 'public'),
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: [
      // @/ → assistant-ui/src/ (self-contained, no cross-project alias)
      { find: /^@\//, replacement: `${srcRoot}/` }
    ],
  },
  server: {
    port: 3100,
    fs: {
      allow: [projectRoot, path.resolve(projectRoot, '..')],
    },
    proxy: {
      '/console/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
