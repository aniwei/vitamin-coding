import { afterEach, describe, expect, it } from 'vitest'

import { loadSetting } from '../src/setting'
import { registerMigration, resetMigrations } from '../src/migrator'
import { createSettingStore } from '../src/store'

describe('setting loading and migrations', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    resetMigrations()
  })

  it('merges disabled lists from defaults and store layers without duplicates', async () => {
    const store = createSettingStore({
      type: 'memory',
      initial: {
        shared: JSON.stringify({
          disabled_tools: ['read', 'grep'],
        }),
        project: JSON.stringify({
          disabled_tools: ['grep', 'write'],
        }),
      },
    })

    const setting = await loadSetting({
      store,
      paths: ['shared', 'project'],
    })

    expect(setting.disabled_tools).toContain('read')
    expect(setting.disabled_tools).toContain('grep')
    expect(setting.disabled_tools).toContain('write')
    expect(new Set(setting.disabled_tools).size).toBe(setting.disabled_tools.length)
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

    const setting = await loadSetting()

    expect(setting.config_version).toBe('2.0.0')
    expect(setting.model).toBe('migrated-model')
  })
})
