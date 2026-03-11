import { defineConfig } from 'tsup'
import { createStripInvariantInProductionPlugin } from '../invariant/src/tsup-strip-invariant-plugin'

const isProduction = process.env.NODE_ENV === 'production'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
  outDir: 'dist',
  splitting: false,
  treeshake: true,
  esbuildPlugins: isProduction
    ? [createStripInvariantInProductionPlugin({ filter: /\/src\/(agent|agent-loop)\.ts$/ })]
    : [],
})
