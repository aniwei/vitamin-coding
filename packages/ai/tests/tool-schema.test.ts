import { describe, expect, it } from 'vitest'

import type { ZodType } from '../src/types'
import { toGeminiToolJsonSchema, toToolJsonSchema } from '../src/utils/tool-schema'

describe('tool-schema utils', () => {
  describe('#given a schema with toJSONSchema', () => {
    describe('#when converting to standard tool schema', () => {
      it('#then returns JSON schema from converter', () => {
        const schema: ZodType = {
          parse: () => ({ query: 'ok' }),
          safeParse: () => ({ success: true, data: { query: 'ok' } }),
          toJSONSchema: () => ({
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          }),
        }

        const result = toToolJsonSchema(schema)

        expect(result).toEqual({
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        })
      })
    })
  })

  describe('#given a schema without toJSONSchema', () => {
    describe('#when converting to standard tool schema', () => {
      it('#then falls back to object placeholder', () => {
        const schema: ZodType = {
          parse: () => ({}),
          safeParse: () => ({ success: true, data: {} }),
        }

        const result = toToolJsonSchema(schema)

        expect(result).toEqual({ type: 'object' })
      })
    })
  })

  describe('#given nested JSON schema', () => {
    describe('#when converting to Gemini tool schema', () => {
      it('#then uppercases all nested type fields', () => {
        const schema: ZodType = {
          parse: () => ({}),
          safeParse: () => ({ success: true, data: {} }),
          toJSONSchema: () => ({
            type: 'object',
            properties: {
              query: { type: 'string' },
              filters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    field: { type: 'string' },
                    enabled: { type: 'boolean' },
                  },
                },
              },
            },
          }),
        }

        const result = toGeminiToolJsonSchema(schema)

        expect(result).toEqual({
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING' },
            filters: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  field: { type: 'STRING' },
                  enabled: { type: 'BOOLEAN' },
                },
              },
            },
          },
        })
      })
    })
  })
})
