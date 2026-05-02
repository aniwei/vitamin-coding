/// <reference types="node" />
import { defineConfig } from 'tsdown'
import { baseConfig } from '../../tsdown.config.ts'
import { createStripInvariantInProductionPlugin } from '@x-mars/invariant'

const isProduction = process.env.NODE_ENV === 'production'

export default defineConfig({
  ...baseConfig,
  plugins: isProduction
    ? [createStripInvariantInProductionPlugin({ filter: /\/src\/(agent|work-loop)\.ts$/ })]
    : [],
})
