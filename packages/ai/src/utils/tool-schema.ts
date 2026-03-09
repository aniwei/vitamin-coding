import type { ZodType } from '../types'

const FALLBACK_SCHEMA: Record<string, unknown> = { type: 'object' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function toToolJsonSchema(parameters: ZodType<unknown>): Record<string, unknown> {
  const schema = parameters.toJSONSchema?.()
  if (!isRecord(schema)) {
    return FALLBACK_SCHEMA
  }

  return schema
}

export function toGeminiToolJsonSchema(parameters: ZodType<unknown>): Record<string, unknown> {
  const schema = toToolJsonSchema(parameters)
  return uppercaseGeminiSchemaType(schema)
}

function uppercaseGeminiSchemaType(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type' && typeof value === 'string') {
      result[key] = value.toUpperCase()
      continue
    }

    if (Array.isArray(value)) {
      result[key] = value.map((item) => (isRecord(item) ? uppercaseGeminiSchemaType(item) : item))
      continue
    }

    if (isRecord(value)) {
      result[key] = uppercaseGeminiSchemaType(value)
      continue
    }

    result[key] = value
  }

  return result
}
