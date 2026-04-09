import { defineConfig } from 'tsdown'
import { baseConfig } from '../../tsdown.config.ts'

export default defineConfig({
  ...baseConfig,
  banner: { js: '#!/usr/bin/env node' },
})
