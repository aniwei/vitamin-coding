import { afterEach, describe, expect, it } from 'vitest'

import { VITAMIN_DEFAULT_CONFIG } from '../src/types'
import { loadSetting } from '../src/setting'

describe('loadSetting', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns defaults when no overrides are provided', async () => {
    const setting = await loadSetting()

    expect(setting.config_version).toBe(VITAMIN_DEFAULT_CONFIG.config_version)
    expect(setting.log_level).toBe('info')
    expect(setting.theme).toBe('auto')
    expect(setting.tool_preset).toBe('standard')
  })

  it('applies extension defaults and allows overrides to win', async () => {
    const setting = await loadSetting({
      extensionDefaults: {
        model: 'extension-model',
        theme: 'light',
      },
      overrides: {
        model: 'cli-model',
      },
    })

    expect(setting.model).toBe('cli-model')
    expect(setting.theme).toBe('light')
  })

  it('uses environment variables as a layer below overrides', async () => {
    process.env.VITAMIN_MODEL = 'env-model'
    process.env.VITAMIN_LOG_LEVEL = 'debug'

    const settingFromEnv = await loadSetting()
    expect(settingFromEnv.model).toBe('env-model')
    expect(settingFromEnv.log_level).toBe('debug')

    const settingWithOverride = await loadSetting({
      overrides: { model: 'cli-model' },
    })
    expect(settingWithOverride.model).toBe('cli-model')
  })

  it('ignores invalid log level from environment', async () => {
    process.env.VITAMIN_LOG_LEVEL = 'not-a-level'

    const setting = await loadSetting()
    expect(setting.log_level).toBe('info')
  })
})
