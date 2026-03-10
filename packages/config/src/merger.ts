import type { VitaminConfig } from './types'

const DISABLED_KEYS = new Set([
  'disabled_agents',
  'disabled_hooks',
  'disabled_mcps',
  'disabled_skills',
  'disabled_tools',
])

function isDisabledArray(key: string): boolean {
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
      result[key] = deepMerge(result[key] as Record<string, unknown>, value)
      continue
    }

    result[key] = value
  }

  return result
}

export function mergeConfigs(
  lower: Partial<VitaminConfig>,
  higher: Partial<VitaminConfig>,
): Partial<VitaminConfig> {
  const result = { ...lower }

  for (const [key, value] of Object.entries(higher)) {
    if (value === undefined) continue

    if (isDisabledArray(key)) {
      const existing = (result[key as keyof VitaminConfig] as string[] | undefined) ?? []
      const incoming = value as string[]
      result[key as keyof VitaminConfig] = [...new Set([...existing, ...incoming])] as never
      continue
    }

    if (isPlainObject(value) && isPlainObject(result[key as keyof VitaminConfig])) {
      result[key as keyof VitaminConfig] = deepMerge(
        result[key as keyof VitaminConfig] as Record<string, unknown>,
        value,
      ) as never
      continue
    }

    result[key as keyof VitaminConfig] = value as never
  }

  return result
}

export function mergeConfigLayers(...layers: Partial<VitaminConfig>[]): Partial<VitaminConfig> {
  let result: Partial<VitaminConfig> = {}

  for (const layer of layers) {
    result = mergeConfigs(result, layer)
  }

  return result
}
