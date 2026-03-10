import { describe, expect, it } from 'vitest'
import {
  AgentConfigSchema,
  CategoryConfigSchema,
  LogLevelSchema,
  VitaminConfigSchema,
  VitaminConfigStrictSchema,
} from '../src/schema/index'

describe('VitaminConfigSchema', () => {
  describe('#given a valid config', () => {
    it('#then parses successfully', () => {
      const result = VitaminConfigSchema.safeParse({
        config_version: '1.0.0',
        log_level: 'debug',
        model: 'claude-sonnet-4-6',
        theme: 'dark',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('#given an empty object', () => {
    it('#then parses successfully (all fields optional)', () => {
      const result = VitaminConfigSchema.safeParse({})
      expect(result.success).toBe(true)
    })
  })

  describe('#given an invalid log_level', () => {
    it('#then fails validation', () => {
      const result = VitaminConfigSchema.safeParse({
        log_level: 'verbose',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('#given agents config', () => {
    it('#then validates nested agent config', () => {
      const result = VitaminConfigSchema.safeParse({
        agents: {
          sisyphus: {
            model: 'claude-sonnet-4-6',
            temperature: 0.5,
          },
        },
      })
      expect(result.success).toBe(true)
    })
  })

  describe('#given invalid temperature', () => {
    it('#then rejects temperature > 2', () => {
      const result = AgentConfigSchema.safeParse({
        temperature: 3.0,
      })
      expect(result.success).toBe(false)
    })
  })
})

describe('VitaminConfigSchema passthrough', () => {
  describe('#given config with unknown fields', () => {
    it('#then preserves unknown fields via passthrough', () => {
      const result = VitaminConfigSchema.safeParse({
        log_level: 'info',
        custom_plugin_field: 'hello',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.custom_plugin_field).toBe('hello')
      }
    })
  })

  describe('#given strict schema with unknown fields', () => {
    it('#then strict schema strips unknown fields', () => {
      const result = VitaminConfigStrictSchema.safeParse({
        log_level: 'info',
        custom_plugin_field: 'hello',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect('custom_plugin_field' in result.data).toBe(false)
      }
    })
  })
})

describe('LogLevelSchema', () => {
  describe('#given valid log levels', () => {
    it('#then accepts all 6 levels', () => {
      for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
        expect(LogLevelSchema.safeParse(level).success).toBe(true)
      }
    })
  })

  describe('#given invalid log level', () => {
    it('#then rejects it', () => {
      expect(LogLevelSchema.safeParse('verbose').success).toBe(false)
    })
  })
})

describe('CategoryConfigSchema', () => {
  describe('#given a valid category config', () => {
    it('#then parses with preferred_models', () => {
      const result = CategoryConfigSchema.safeParse({
        preferred_models: ['claude-sonnet-4-6', 'gpt-4o'],
        default_model: 'claude-sonnet-4-6',
      })
      expect(result.success).toBe(true)
    })
  })
})
