import { afterEach, describe, expect, it } from 'vitest'

import { VITAMIN_DEFAULT_CONFIG } from '../src/types'
import { loadConfig } from '../src/loader'

describe('loadConfig', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns defaults when no overrides are provided', async () => {
    const config = await loadConfig()

    expect(config.config_version).toBe(VITAMIN_DEFAULT_CONFIG.config_version)
    expect(config.log_level).toBe('info')
    expect(config.theme).toBe('auto')
    expect(config.tool_preset).toBe('standard')
  })

  it('applies extension defaults and allows overrides to win', async () => {
    const config = await loadConfig({
      extensionDefaults: {
        model: 'extension-model',
        theme: 'light',
      },
      overrides: {
        model: 'cli-model',
      },
    })

    expect(config.model).toBe('cli-model')
    expect(config.theme).toBe('light')
  })

  it('uses environment variables as a layer below overrides', async () => {
    process.env.VITAMIN_MODEL = 'env-model'
    process.env.VITAMIN_LOG_LEVEL = 'debug'

    const configFromEnv = await loadConfig()
    expect(configFromEnv.model).toBe('env-model')
    expect(configFromEnv.log_level).toBe('debug')

    const configWithOverride = await loadConfig({
      overrides: { model: 'cli-model' },
    })
    expect(configWithOverride.model).toBe('cli-model')
  })

  it('ignores invalid log level from environment', async () => {
    process.env.VITAMIN_LOG_LEVEL = 'not-a-level'

    const config = await loadConfig()
    expect(config.log_level).toBe('info')
  })
})
