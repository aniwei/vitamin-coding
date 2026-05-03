import { describe, expect, it } from 'vitest'
import { jsonSchemaObjectToZod, jsonSchemaPropertyToZod } from '../src'

describe('json schema to zod', () => {
  it('#converts primitive and enum properties', () => {
    expect(jsonSchemaPropertyToZod({ type: 'string' }).safeParse('ok').success).toBe(true)
    expect(jsonSchemaPropertyToZod({ type: 'number' }).safeParse('no').success).toBe(false)
    expect(
      jsonSchemaPropertyToZod({ type: 'string', enum: ['red', 'blue'] }).safeParse('red').success,
    ).toBe(true)
    expect(
      jsonSchemaPropertyToZod({ type: 'string', enum: ['red', 'blue'] }).safeParse('green').success,
    ).toBe(false)
  })

  it('#converts object properties with required fields', () => {
    const schema = jsonSchemaObjectToZod({
      type: 'object',
      required: ['host'],
      properties: {
        host: { type: 'string' },
        port: { type: 'number' },
      },
    })

    expect(schema.safeParse({ host: 'localhost', port: 8080 }).success).toBe(true)
    expect(schema.safeParse({ host: 'localhost' }).success).toBe(true)
    expect(schema.safeParse({}).success).toBe(false)
  })
})
