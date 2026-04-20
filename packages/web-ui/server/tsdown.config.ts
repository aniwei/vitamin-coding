import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  dts: false,
  external: [
    'pg',
    'drizzle-orm',
    'drizzle-kit',
    'better-auth',
    '@modelcontextprotocol/sdk',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    'undici',
    'ioredis',
  ],
})
