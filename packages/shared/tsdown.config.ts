import { defineConfig } from 'tsdown'
import { baseConfig } from '../../tsdown.config.ts'

export default defineConfig({
  ...baseConfig,
  entry: [
    'src/index.ts',
    'src/browser/index.ts',
    'src/browser/event-emitter.ts',
    'src/browser/subscription.ts',
  ],
})
