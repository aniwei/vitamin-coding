import { defineConfig } from 'tsup'
import { baseConfig } from '../../tsup.config.base'

export default defineConfig([
  { ...baseConfig },
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
