import { defineConfig } from 'tsdown'
import { baseConfig } from '../../tsdown.config.ts'

export default defineConfig([
  { ...baseConfig },
  {
    entry: ['src/service-worker.ts'],
    format: ['cjs'],
    dts: false,
    sourcemap: true,
    target: 'node22',
    outDir: 'dist',
    treeshake: true,
    deps: { alwaysBundle: [/.*/] },
  },
])
