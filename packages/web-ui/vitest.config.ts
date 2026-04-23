import { defineConfig } from "vitest/config"

import tsconfigPaths from "vite-tsconfig-paths"

const apiUrl = process.env.VITE_API_URL || 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    exclude: ["**/tests/**", "**/node_modules/**"],
  },
  server: {
    strictPort: false, // Allow Vite to try next port if 5173 is busy
    proxy: {
      '/api': {
        target: apiUrl,
        changeOrigin: true,
      },
      '/ws': {
        target: apiUrl.replace('http', 'ws'),
        ws: true,
        changeOrigin: true,
        // Add logging to debug proxy
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[Vite Proxy] Forwarding WebSocket:', req.url, 'to', apiUrl);
          });
        },
      },
    },
  },
});
