import { afterEach, describe, expect, it, vi } from 'vitest'

const { readTextMock } = vi.hoisted(() => ({
  readTextMock: vi.fn<(_: string) => Promise<string | undefined>>(),
}))

vi.mock('@vitamin/shared', async () => {
  const actual = await vi.importActual<typeof import('@vitamin/shared')>('@vitamin/shared')
  return {
    ...actual,
    readText: readTextMock,
  }
})

import { PROJ_CONFIG_PATH, USER_CONFIG_PATH } from '../src/constant'
import { loadConfig } from '../src/loader'

describe('loadConfig', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    readTextMock.mockReset()
  })

  describe('#given no config files exist', () => {
    it('#then returns defaults', async () => {
      readTextMock.mockResolvedValue(undefined)

      const { config, projectConfigPath, userConfigPath } = await loadConfig()

      expect(config.log_level).toBe('info')
      expect(config.config_version).toBe('1.0.0')
      expect(projectConfigPath).toBeUndefined()
      expect(userConfigPath).toBeUndefined()
    })
  })

  describe('#given a project config file', () => {
    it('#then loads and merges it over defaults', async () => {
      readTextMock.mockImplementation(async (path) => {
        if (path === PROJ_CONFIG_PATH) {
          return '{ "log_level": "debug", "model": "claude-sonnet-4-6" }'
        }

        return undefined
      })

      const { config, projectConfigPath } = await loadConfig()

      expect(config.log_level).toBe('debug')
      expect(config.model).toBe('claude-sonnet-4-6')
      expect(projectConfigPath).toBe(PROJ_CONFIG_PATH)
    })
  })

  describe('#given both user and project config files', () => {
    it('#then project config has higher priority than user config', async () => {
      readTextMock.mockImplementation(async (path) => {
        if (path === USER_CONFIG_PATH) {
          return '{ "model": "user-model", "theme": "dark" }'
        }

        if (path === PROJ_CONFIG_PATH) {
          return '{ "model": "project-model" }'
        }

        return undefined
      })

      const { config, projectConfigPath, userConfigPath } = await loadConfig()

      expect(config.model).toBe('project-model')
      expect(config.theme).toBe('dark')
      expect(projectConfigPath).toBe(PROJ_CONFIG_PATH)
      expect(userConfigPath).toBe(USER_CONFIG_PATH)
    })
  })

  describe('#given CLI overrides', () => {
    it('#then CLI takes highest priority', async () => {
      readTextMock.mockImplementation(async (path) => {
        if (path === PROJ_CONFIG_PATH) {
          return '{ "model": "project-model" }'
        }

        return undefined
      })

      const { config } = await loadConfig({
        overrides: { model: 'cli-model' },
      })

      expect(config.model).toBe('cli-model')
    })
  })

  describe('#given extension defaults', () => {
    it('#then extension defaults are lower priority than project config', async () => {
      readTextMock.mockImplementation(async (path) => {
        if (path === PROJ_CONFIG_PATH) {
          return '{ "model": "project-model" }'
        }

        return undefined
      })

      const { config } = await loadConfig({
        extensionDefaults: {
          model: 'extension-model',
          theme: 'extension-theme',
        },
      })

      expect(config.model).toBe('project-model')
      expect(config.theme).toBe('extension-theme')
    })
  })

  describe('#given VITAMIN_* environment variables', () => {
    it('#then env layer overrides file config but not CLI', async () => {
      readTextMock.mockImplementation(async (path) => {
        if (path === PROJ_CONFIG_PATH) {
          return '{ "model": "project-model" }'
        }

        return undefined
      })

      process.env.VITAMIN_MODEL = 'env-model'
      process.env.VITAMIN_LOG_LEVEL = 'debug'

      const { config } = await loadConfig()

      expect(config.model).toBe('env-model')
      expect(config.log_level).toBe('debug')
    })

    it('#then CLI overrides still take precedence over env', async () => {
      readTextMock.mockResolvedValue(undefined)
      process.env.VITAMIN_MODEL = 'env-model'

      const { config } = await loadConfig({
        overrides: { model: 'cli-model' },
      })

      expect(config.model).toBe('cli-model')
    })
  })

  describe('#given a JSONC file with parse errors', () => {
    it('#then throws a parse error with config path', async () => {
      readTextMock.mockImplementation(async (path) => {
        if (path === PROJ_CONFIG_PATH) {
          return '{ "log_level": "debug", "model": BROKEN_VALUE }'
        }

        return undefined
      })

      await expect(loadConfig()).rejects.toThrow(`Failed to parse config at ${PROJ_CONFIG_PATH}`)
    })
  })

  describe('#given unknown config fields', () => {
    it('#then keeps known fields available', async () => {
      readTextMock.mockImplementation(async (path) => {
        if (path === PROJ_CONFIG_PATH) {
          return '{ "log_level": "info", "unknown_field": true }'
        }

        return undefined
      })

      const { config } = await loadConfig()

      expect(config.log_level).toBe('info')
    })
  })
})
