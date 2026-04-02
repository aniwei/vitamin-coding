import { createLogger, parseJsonc } from '@vitamin/shared'
import { LOG_LEVELS, TOOL_PRESETS, VITAMIN_SETTING_KEYS } from './types'
import { migrate } from './migrator'

import { type VitaminSetting, type LoadSettingOptions, VITAMIN_DEFAULT_CONFIG } from './types'
import type { SettingStore } from './store'

const logger = createLogger('@vitamin/setting')
const LOG_LEVEL_SET = new Set<string>(LOG_LEVELS)
const TOOL_PRESET_SET = new Set<string>(TOOL_PRESETS)

const ROOT_STRING_KEYS = ['config_version', 'version', 'model', 'theme'] as const
const ROOT_STRING_ARRAY_KEYS = [
  'model_fallback',
  'disabled_agents',
  'disabled_hooks',
  'disabled_tools',
  '_migrations',
] as const
const ROOT_OBJECT_KEYS = [
  'agents',
  'categories',
  'session',
  'compaction',
  'notification',
  'workflow',
  'model_slots',
  'background_task',
  'experimental',
] as const
const REMOVED_LEGACY_KEYS = [
  'mcp',
  'skills',
  'disabled_mcps',
  'disabled_skills',
] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function dropInvalidField(target: Partial<VitaminSetting>, key: string, message: string): void {
  logger.warn({ key, message }, 'Config validation issue')
  delete target[key]
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
    return merge(result, ...others)
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
    if (LOG_LEVEL_SET.has(logLevel)) {
      setting.log_level = logLevel as VitaminSetting['log_level']
    }
  }

  return setting
}

function validate(setting: Partial<VitaminSetting>): Partial<VitaminSetting> {
  const knownKeys = new Set<string>(VITAMIN_SETTING_KEYS)
  const validated: Partial<VitaminSetting> = { ...setting }

  for (const key of REMOVED_LEGACY_KEYS) {
    if (validated[key] !== undefined) {
      logger.warn({ key }, 'Removed legacy config key is ignored')
      delete validated[key]
    }
  }
  
  for (const key of Object.keys(validated)) {
    if (!knownKeys.has(key)) {
      logger.warn({ key }, 'Unknown config key (passthrough)')
    }
  }

  for (const key of ROOT_STRING_KEYS) {
    const value = validated[key]
    if (value !== undefined && typeof value !== 'string') {
      dropInvalidField(validated, key, 'Expected string')
    }
  }

  const logLevel = validated.log_level
  if (logLevel !== undefined && (typeof logLevel !== 'string' || !LOG_LEVEL_SET.has(logLevel))) {
    dropInvalidField(validated, 'log_level', `Invalid log_level: ${String(logLevel)}`)
  }

  const toolPreset = validated.tool_preset
  if (
    toolPreset !== undefined
    && (typeof toolPreset !== 'string' || !TOOL_PRESET_SET.has(toolPreset))
  ) {
    dropInvalidField(validated, 'tool_preset', `Invalid tool_preset: ${String(toolPreset)}`)
  }

  for (const key of ROOT_STRING_ARRAY_KEYS) {
    const value = validated[key]
    if (value !== undefined && !isStringArray(value)) {
      dropInvalidField(validated, key, 'Expected string[]')
    }
  }

  for (const key of ROOT_OBJECT_KEYS) {
    const value = validated[key]
    if (value !== undefined && !isPlainObject(value)) {
      dropInvalidField(validated, key, 'Expected object')
    }
  }

  return validated
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

