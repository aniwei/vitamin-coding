import { createLogger, parseJsonc } from '@vitamin/shared'
import { VitaminConfigSchema, VitaminConfigStrictSchema } from './schema'
import { migrate } from './migrator'

import { type VitaminConfig, type LoadConfigOptions, VITAMIN_DEFAULT_CONFIG } from './types'
import type { ConfigStore } from './store'

const logger = createLogger('@vitamin/config')
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

function loadConfigFromEnv(): Partial<VitaminConfig> {
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

// 从 ConfigStore 按路径列表依次读取配置文件（JSONC），按优先级从低到高合并
async function loadConfigFromStore(
  store: ConfigStore,
  paths: string[],
): Promise<Partial<VitaminConfig>[]> {
  const layers: Partial<VitaminConfig>[] = []

  for (const path of paths) {
    try {
      const content = await store.read(path)
      if (content !== undefined) {
        const parsed = parseJsonc<Partial<VitaminConfig>>(content)
        layers.push(parsed)
        logger.debug({ path }, 'Config loaded from store')
      }
    } catch (error) {
      logger.warn({ path, err: error }, 'Failed to parse config file, skipping')
    }
  }

  return layers
}

export class ConfigLoader {
  private store?: ConfigStore

  constructor(store?: ConfigStore) {
    this.store = store
  }

  async load(options: LoadConfigOptions = {}): Promise<VitaminConfig> {
    const {
      overrides = {},
      extensionDefaults = {},
      store = this.store,
      configPaths = [],
    } = options

    // 从持久化后端加载文件层
    const fileLayers = store && configPaths.length > 0
      ? await loadConfigFromStore(store, configPaths)
      : []

    const env = loadConfigFromEnv()

    // 合并优先级：defaults < extensionDefaults < file layers (低→高) < env < overrides
    const merged = mergeLayers(
      VITAMIN_DEFAULT_CONFIG,
      extensionDefaults,
      ...fileLayers,
      env,
      overrides,
    )

    const { config: migrated, applied } = migrate(merged as Record<string, unknown>)
    if (applied.length > 0) {
      logger.info({ applied }, 'Config migrations applied')
    }

    const validated = validate(migrated as Partial<VitaminConfig>)

    return { ...VITAMIN_DEFAULT_CONFIG, ...validated }
  }

  // 将当前配置写回持久化后端
  async save(path: string, config: Partial<VitaminConfig>): Promise<void> {
    if (!this.store) {
      throw new Error('Cannot save config: no ConfigStore configured')
    }
    await this.store.write(path, config)
  }
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<VitaminConfig> {
  const loader = new ConfigLoader(options.store)
  return loader.load(options)
}
