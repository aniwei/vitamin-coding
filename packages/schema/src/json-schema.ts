import { z } from 'zod'

export interface JsonSchema {
  type?: string
  description?: string
  enum?: unknown[]
  default?: unknown
  items?: JsonSchema
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean | JsonSchema
  [key: string]: unknown
}

export function jsonSchemaPropertyToZod(schema: JsonSchema): z.ZodType {
  switch (schema.type) {
    case 'string':
      return describe(enumStringSchema(schema) ?? z.string(), schema.description)

    case 'number':
    case 'integer':
      return describe(z.number(), schema.description)

    case 'boolean':
      return describe(z.boolean(), schema.description)

    case 'array': {
      const itemSchema = schema.items ? jsonSchemaPropertyToZod(schema.items) : z.unknown()
      return describe(z.array(itemSchema), schema.description)
    }

    case 'object':
      return describe(
        schema.properties ? jsonSchemaObjectToZod(schema) : z.record(z.string(), z.unknown()),
        schema.description,
      )

    default:
      return describe(z.unknown(), schema.description)
  }
}

export function jsonSchemaObjectToZod(schema: JsonSchema): z.ZodType {
  const props = schema.properties
  if (!props || Object.keys(props).length === 0) {
    return z.object({})
  }

  const shape: Record<string, z.ZodType> = {}
  const requiredSet = new Set(schema.required ?? [])

  for (const [key, value] of Object.entries(props)) {
    const fieldSchema = jsonSchemaPropertyToZod(value)
    shape[key] = requiredSet.has(key) ? fieldSchema : fieldSchema.optional()
  }

  return z.object(shape)
}

function enumStringSchema(schema: JsonSchema): z.ZodType | null {
  if (!schema.enum) {
    return null
  }

  const values = schema.enum.filter((value): value is string => typeof value === 'string')
  if (values.length === 0) {
    return z.never()
  }

  return z.enum(values as [string, ...string[]])
}

function describe<T extends z.ZodType>(schema: T, description: string | undefined): T {
  return description ? (schema.describe(description) as T) : schema
}
