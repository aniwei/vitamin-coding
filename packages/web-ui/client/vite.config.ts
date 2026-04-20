import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  publicDir: 'public',
  // 屏蔽向上查找父目录的 postcss.config.mjs（旧 Next 的 @tailwindcss/postcss 配置）。
  css: {
    postcss: { plugins: [] },
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@': path.resolve(__dirname, 'src'),
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
