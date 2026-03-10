import { createLogger, parseJsonc } from '@vitamin/shared'
import { PROJ_CONFIG_PATH, USER_CONFIG_PATH, VITAMIN_CONFIG } from './constant'
import { VitaminConfigSchema, VitaminConfigStrictSchema } from './schema'
import { migrate } from './migrator'
import { FileSystem } from './storage'

import type { ConfigStore } from './storage'
import type { LoadConfigOptions, LoadConfigResult, VitaminConfig } from './types'

const logger = createLogger('@vitamin/config:manager')
const DISABLED_KEYS = new Set([
  'disabled_agents',
  'disabled_hooks',
  'disabled_mcps',
  'disabled_skills',
  'disabled_tools',
])

function isDisabledKey(key: string): boolean {
  return DISABLED_KEYS.has(key)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target }

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue

    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], value)
    } else {
      result[key] = value
    }
  }

  return result
}


function merge(
  lower: Partial<VitaminConfig>,
  higher: Partial<VitaminConfig>,
): Partial<VitaminConfig> {
  const result = { ...lower }

  for (const [key, value] of Object.entries(higher)) {
    if (value === undefined) continue

    if (isDisabledKey(key)) {
      const existing = (result[key] as string[] | undefined) ?? []
      const incoming = value as string[]

      result[key] = [...new Set([...existing, ...incoming])]
    } else if (isPlainObject(value) && isPlainObject(result[key as keyof VitaminConfig])) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value,
      ) 
    } else {
      result[key] = value
    }
  }

  return result
}

function mergeLayers(...layers: Partial<VitaminConfig>[]): Partial<VitaminConfig> {
  let result: Partial<VitaminConfig> = {}

  for (const layer of layers) {
    result = merge(result, layer)
  }

  return result
}

function loadConfigFromEnvironments(): Partial<VitaminConfig> {
  const config: Partial<VitaminConfig> = {}

  const model = process.env.VITAMIN_MODEL
  if (model) config.model = model

  const theme = process.env.VITAMIN_THEME
  if (theme) config.theme = theme

  const logLevel = process.env.VITAMIN_LOG_LEVEL
  if (logLevel) {
    const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
    if (validLevels.includes(logLevel)) {
      config.log_level = logLevel as VitaminConfig['log_level']
    }
  }

  return config
}

function validate(
  config: Partial<VitaminConfig>
): Partial<VitaminConfig> {
  const knownKeys = new Set(Object.keys(VitaminConfigStrictSchema.shape))
  for (const key of Object.keys(config)) {
    if (!knownKeys.has(key)) {
      logger.warn({ key }, 'Unknown config key (will be ignored)')
    }
  }

  const result = VitaminConfigSchema.safeParse(config)
  if (result.success) {
    return result.data
  }

  for (const issue of result.error.issues) {
    logger.warn({ key: issue.path.join('.'), message: issue.message }, 'Config validation issue')
  }

  const partial = VitaminConfigSchema.partial().safeParse(config)
  return partial.success ? partial.data : {}
}

export interface ConfigManagerOptions {
  store?: ConfigStore
}

export class ConfigManager {
  private readonly store: ConfigStore

  constructor(options: ConfigManagerOptions = {}) {
    this.store = options.store ?? new FileSystem()
  }

  async load(options: LoadConfigOptions = {}): Promise<LoadConfigResult> {
    const { overrides = {}, extensionDefaults = {} } = options

    const [project, user] = await Promise.all([
      this.read(PROJ_CONFIG_PATH),
      this.read(USER_CONFIG_PATH),
    ])

    const env = loadConfigFromEnvironments()

    const merged = mergeLayers(
      VITAMIN_CONFIG,
      extensionDefaults,
      user.config,
      project.config,
      env,
      overrides,
    )

    const { config: migrated, applied } = migrate(merged as Record<string, unknown>)
    if (applied.length > 0) {
      logger.info({ applied }, 'Config migrations applied')
    }

    const validated = validate(migrated as Partial<VitaminConfig>)

    return {
      config: { ...VITAMIN_CONFIG, ...validated },
      projectConfigPath: project.exists ? PROJ_CONFIG_PATH : undefined,
      userConfigPath: user.exists ? USER_CONFIG_PATH : undefined,
    }
  }
  
  // TDOO
  // private async persist(targetPath: string, config: Partial<VitaminConfig>): Promise<void> {
  //   const payload = `${JSON.stringify(config, null, 2)}\n`
  //   await this.store.write(targetPath, payload)
  // }

  private async read(
    targetPath: string
  ): Promise<{ config: Partial<VitaminConfig>; exists: boolean }> {
    const raw = await this.store.read(targetPath)
    if (raw === undefined) {
      return { config: {}, exists: false }
    }

    try {
      return {
        config: parseJsonc<Partial<VitaminConfig>>(raw),
        exists: true,
      }
    } catch (error) {
      throw new Error(`Failed to parse config at ${targetPath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export function createConfigManager(options: ConfigManagerOptions = {}): ConfigManager {
  return new ConfigManager(options)
}
