import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'node:path'

const src = path.resolve(__dirname, '../src')

export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss(), tsconfigPaths({ root: __dirname })],
  publicDir: 'public',
  // 屏蔽向上查找父目录的 postcss.config.mjs（旧 Next 的 @tailwindcss/postcss 配置）。
  css: {
    postcss: { plugins: [] },
  },
  resolve: {
    alias: {
      '@': src,
      'ui': path.resolve(src, 'components/ui'),
      'auth': path.resolve(src, 'lib/auth'),
      'app-types': path.resolve(src, 'types'),
      'lib': path.resolve(src, 'lib'),
      'logger': path.resolve(src, 'lib/logger.ts'),
      'load-env': path.resolve(src, 'lib/load-env.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
})
