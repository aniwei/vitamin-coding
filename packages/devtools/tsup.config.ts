import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/debugger/client.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
  outDir: 'dist',
  splitting: false,
  treeshake: true,
})
