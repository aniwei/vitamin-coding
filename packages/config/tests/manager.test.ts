import { afterEach, describe, expect, it } from 'vitest'
import { ConfigManager } from '../src/manager'
import { registerMigration, resetMigrations } from '../src/migrator'
import { PROJ_CONFIG_PATH, USER_CONFIG_PATH } from '../src/constant'

import type { ConfigStore } from '../src/storage'

class MemoryStore implements ConfigStore {
  constructor(private readonly files: Record<string, string | undefined>) {}

  async read(path: string): Promise<string | undefined> {
    return this.files[path]
  }

  async write(): Promise<void> {
    throw new Error('write not implemented in tests')
  }
}

describe('ConfigManager', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    resetMigrations()
  })

  describe('#given layered inputs', () => {
    it('#then merges by priority: defaults < extension < user < project < env < overrides', async () => {
      const store = new MemoryStore({
        [USER_CONFIG_PATH]: '{ "model": "user-model", "theme": "dark" }',
        [PROJ_CONFIG_PATH]: '{ "model": "project-model" }',
      })

      process.env.VITAMIN_MODEL = 'env-model'
      process.env.VITAMIN_LOG_LEVEL = 'warn'

      const manager = new ConfigManager({ store })
      const result = await manager.load({
        extensionDefaults: {
          model: 'extension-model',
          theme: 'light',
        },
        overrides: {
          model: 'cli-model',
        },
      })

      expect(result.config.model).toBe('cli-model')
      expect(result.config.theme).toBe('dark')
      expect(result.config.log_level).toBe('warn')
      expect(result.userConfigPath).toBe(USER_CONFIG_PATH)
      expect(result.projectConfigPath).toBe(PROJ_CONFIG_PATH)
    })
  })

  describe('#given malformed JSONC content', () => {
    it('#then throws an error containing the target config path', async () => {
      const store = new MemoryStore({
        [PROJ_CONFIG_PATH]: '{ "model": BROKEN_VALUE }',
      })
      const manager = new ConfigManager({ store })

      await expect(manager.load()).rejects.toThrow(`Failed to parse config at ${PROJ_CONFIG_PATH}`)
    })
  })

  describe('#given registered migrations', () => {
    it('#then applies migration and keeps migrated fields after validation', async () => {
      registerMigration({
        version: '2.0.0',
        description: 'set default model when missing',
        migrate(config) {
          return {
            ...config,
            model: typeof config.model === 'string' ? config.model : 'migrated-model',
          }
        },
      })

      const store = new MemoryStore({
        [PROJ_CONFIG_PATH]: '{ "config_version": "1.0.0" }',
      })
      const manager = new ConfigManager({ store })

      const result = await manager.load()

      expect(result.config.model).toBe('migrated-model')
      expect(result.config.config_version).toBe('2.0.0')
    })
  })
})
