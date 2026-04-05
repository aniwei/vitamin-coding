import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node22',
    outDir: 'dist',
    splitting: false,
    treeshake: true,
  },
  {
    entry: ['src/service-worker.ts'],
    format: ['cjs'],
    dts: false,
    sourcemap: true,
    target: 'node22',
    outDir: 'dist',
    splitting: false,
    treeshake: true,
    noExternal: [/.*/],
  },
])
