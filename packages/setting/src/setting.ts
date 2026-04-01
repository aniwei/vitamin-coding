import { createLogger, parseJsonc } from '@vitamin/shared'
import { VitaminSettingSchema, VitaminSettingStrictSchema } from './schema'
import { migrate } from './migrator'

import { type VitaminSetting, type LoadSettingOptions, VITAMIN_DEFAULT_CONFIG } from './types'
import type { SettingStore } from './store'

const logger = createLogger('@vitamin/setting')

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


function merge(...layers: Partial<VitaminSetting>[]): Partial<VitaminSetting> {
  const [lower, higher, ...others] = layers
  const result = { ...lower }

  if (higher) {
    for (const [key, value] of Object.entries(higher)) {
      if (value === undefined) continue
  
      if (Array.isArray(result[key]) && Array.isArray(value)) {
        const existing = result[key] as string[]
        const incoming = value as string[]
  
        result[key] = [...new Set([...existing, ...incoming])]
      } else if (isPlainObject(value) && isPlainObject(result[key as keyof VitaminSetting])) {
        result[key] = deepMerge(
          result[key] as Record<string, unknown>,
          value,
        ) 
      } else {
        result[key] = value
      }
    }
  }

  if (others.length > 0) {
    return merge(result, ...others.slice(2))
  }

  return result
}

function loadSettingFromEnv(): Partial<VitaminSetting> {
  const setting: Partial<VitaminSetting> = {}

  const model = process.env.VITAMIN_MODEL
  if (model) setting.model = model

  const theme = process.env.VITAMIN_THEME
  if (theme) setting.theme = theme

  const logLevel = process.env.VITAMIN_LOG_LEVEL
  if (logLevel) {
    const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
    if (validLevels.includes(logLevel)) {
      setting.log_level = logLevel as VitaminSetting['log_level']
    }
  }

  return setting
}

function validate(setting: Partial<VitaminSetting>): Partial<VitaminSetting> {
  const knownKeys = new Set(Object.keys(VitaminSettingStrictSchema.shape))
  
  for (const key of Object.keys(setting)) {
    if (!knownKeys.has(key)) {
      logger.warn({ key }, 'Unknown config key (will be ignored)')
    }
  }

  const result = VitaminSettingSchema.safeParse(setting)
  if (result.success) {
    return result.data
  }

  for (const issue of result.error.issues) {
    logger.warn({ key: issue.path.join('.'), message: issue.message }, 'Config validation issue')
  }

  const partial = VitaminSettingSchema.partial().safeParse(setting)
  return partial.success ? partial.data : {}
}

async function loadSettingFromStore(
  store: SettingStore,
  paths: string[],
): Promise<Partial<VitaminSetting>[]> {
  const layers: Partial<VitaminSetting>[] = []

  for (const path of paths) {
    try {
      const content = await store.read(path)
      if (content !== undefined) {
        const parsed = parseJsonc<Partial<VitaminSetting>>(content)
        layers.push(parsed)
        logger.debug({ path }, 'Config loaded from store')
      }
    } catch (error) {
      logger.warn({ path, err: error }, 'Failed to parse config file, skipping')
    }
  }

  return layers
}

export class SettingLoader {
  private store?: SettingStore

  constructor(store?: SettingStore) {
    this.store = store
  }

  async load(options: LoadSettingOptions = {}): Promise<VitaminSetting> {
    const {
      store = this.store,
      paths = [],
    } = options

    const layers = store && paths.length > 0
      ? await loadSettingFromStore(store, paths)
      : []

    const env = loadSettingFromEnv()
    const merged = merge(
      VITAMIN_DEFAULT_CONFIG,
      ...layers,
      env
    )

    const { config: migrated, applied } = migrate(merged as Record<string, unknown>)
    if (applied.length > 0) {
      logger.info({ applied }, 'Config migrations applied')
    }

    const validated = validate(migrated as Partial<VitaminSetting>)

    return { ...VITAMIN_DEFAULT_CONFIG, ...validated }
  }

  async save(path: string, config: Partial<VitaminSetting>): Promise<void> {
    if (!this.store) {
      throw new Error('Cannot save setting: no SettingStore configured')
    }
    await this.store.write(path, config)
  }
}

export async function loadSetting(options: LoadSettingOptions = {}): Promise<VitaminSetting> {
  const loader = new SettingLoader(options.store)
  return loader.load(options)
}

