import { createLogger } from '@vitamin/shared'
import { VITAMIN_CONFIG } from './constant'
import { VitaminConfigSchema, VitaminConfigStrictSchema } from './schema'
import { migrate } from './migrator'


import type { VitaminConfig, LoadConfigOptions } from './types'


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

export interface ConfigStore {
  read(path: string): Promise<string | undefined>
}


export class ConfigLoader {
  async load(options: LoadConfigOptions = {}): Promise<VitaminConfig> {
    const { overrides = {}, extensionDefaults = {} } = options

    const env = loadConfigFromEnvironments()
    const merged = mergeLayers(
      VITAMIN_CONFIG,
      extensionDefaults,
      env,
      overrides,
    )

    const { config: migrated, applied } = migrate(merged as Record<string, unknown>)
    if (applied.length > 0) {
      logger.info({ applied }, 'Config migrations applied')
    }

    const validated = validate(migrated as Partial<VitaminConfig>)

    return { ...VITAMIN_CONFIG, ...validated }
  }
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<VitaminConfig> {
  const loader = new ConfigLoader()
  return loader.load(options)
}
