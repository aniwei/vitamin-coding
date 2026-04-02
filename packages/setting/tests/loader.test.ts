import { afterEach, describe, expect, it } from 'vitest'

import { VITAMIN_DEFAULT_CONFIG } from '../src/types'
import { loadSetting } from '../src/setting'
import { createSettingStore } from '../src/store'

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
    expect(setting.tool_preset).toBe('full')
  })

  it('applies layered store settings with later paths taking precedence', async () => {
    const store = createSettingStore({
      type: 'memory',
      initial: {
        base: JSON.stringify({
          model: 'base-model',
          theme: 'light',
        }),
        project: JSON.stringify({
          model: 'project-model',
        }),
      },
    })

    const setting = await loadSetting({
      store,
      paths: ['base', 'project'],
    })

    expect(setting.model).toBe('project-model')
    expect(setting.theme).toBe('light')
  })

  it('uses environment variables as the highest-priority layer', async () => {
    process.env.VITAMIN_MODEL = 'env-model'
    process.env.VITAMIN_LOG_LEVEL = 'debug'

    const store = createSettingStore({
      type: 'memory',
      initial: {
        base: JSON.stringify({
          model: 'file-model',
          log_level: 'warn',
        }),
      },
    })

    const settingFromEnv = await loadSetting({
      store,
      paths: ['base'],
    })
    expect(settingFromEnv.model).toBe('env-model')
    expect(settingFromEnv.log_level).toBe('debug')
  })

  it('ignores invalid log level from environment', async () => {
    process.env.VITAMIN_LOG_LEVEL = 'not-a-level'

    const setting = await loadSetting()
    expect(setting.log_level).toBe('info')
  })
})
