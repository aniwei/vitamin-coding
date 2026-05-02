export type UnknownRecord = Record<string, unknown>

export function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {}
}

export function readString(data: UnknownRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string') {
      return value
    }
  }

  return undefined
}

export function readNumber(data: UnknownRecord, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return undefined
}

export function readBoolean(data: UnknownRecord, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'boolean') {
      return value
    }
  }

  return undefined
}

export function readObject<T = UnknownRecord>(
  data: UnknownRecord,
  ...keys: string[]
): T | undefined {
  for (const key of keys) {
    const value = data[key]
    if (isRecord(value)) {
      return value as T
    }
  }

  return undefined
}

export function readArray<T = unknown>(data: UnknownRecord, ...keys: string[]): T[] | undefined {
  for (const key of keys) {
    const value = data[key]
    if (Array.isArray(value)) {
      return value as T[]
    }
  }

  return undefined
}

export function toCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

export function normalizeKeysToCamel<T>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeKeysToCamel(item)) as T
  }

  if (isRecord(value)) {
    const out: UnknownRecord = {}
    for (const [key, val] of Object.entries(value)) {
      out[toCamelKey(key)] = normalizeKeysToCamel(val)
    }
    return out as T
  }

  return value as T
}
