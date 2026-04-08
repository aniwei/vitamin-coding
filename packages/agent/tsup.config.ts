import { defineConfig } from 'tsup'
import { baseConfig } from '../../tsup.config.base'
import { createStripInvariantInProductionPlugin } from '../invariant/src/tsup-strip-invariant-plugin'

const isProduction = process.env.NODE_ENV === 'production'

export default defineConfig({
  ...baseConfig,
  esbuildPlugins: isProduction
    ? [createStripInvariantInProductionPlugin({ filter: /\/src\/(agent|work-loop)\.ts$/ })]
    : [],
})
