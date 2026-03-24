import { afterEach, describe, expect, it } from 'vitest'

import { loadConfig } from '../src/loader'
import { registerMigration, resetMigrations } from '../src/migrator'

describe('config loading and migrations', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    resetMigrations()
  })

  it('merges disabled lists from defaults, env and overrides without duplicates', async () => {
    const config = await loadConfig({
      extensionDefaults: {
        disabled_tools: ['read', 'grep'],
      },
      overrides: {
        disabled_tools: ['grep', 'write'],
      },
    })

    expect(config.disabled_tools).toContain('read')
    expect(config.disabled_tools).toContain('grep')
    expect(config.disabled_tools).toContain('write')
    expect(new Set(config.disabled_tools).size).toBe(config.disabled_tools.length)
  })

  it('applies registered migrations before final validation', async () => {
    registerMigration({
      version: '2.0.0',
      description: 'add migrated model when missing',
      migrate(config) {
        return {
          ...config,
          model: typeof config.model === 'string' ? config.model : 'migrated-model',
        }
      },
    })

    const config = await loadConfig()

    expect(config.config_version).toBe('2.0.0')
    expect(config.model).toBe('migrated-model')
  })
})
