// @vitamin/tools tool-validator 测试
import { describe, expect, it } from 'vitest'
import { validateToolArgs } from '../src/tool-validator'

describe('validateToolArgs', () => {
  describe('#given a passing schema', () => {
    const schema = {
      safeParse(input: unknown) {
        return { success: true as const, data: input as { path: string } }
      },
    }

    it('#then returns success with data', () => {
      const result = validateToolArgs(schema, { path: '/tmp/test.txt' })
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ path: '/tmp/test.txt' })
      expect(result.error).toBeUndefined()
    })
  })

  describe('#given a failing schema with Zod-style issues', () => {
    const schema = {
      safeParse(_input: unknown) {
        return {
          success: false as const,
          error: {
            issues: [
              { path: ['path'], message: 'Required' },
              { path: ['content'], message: 'Expected string, received number' },
            ],
          },
        }
      },
    }

    it('#then returns failure with formatted error', () => {
      const result = validateToolArgs(schema, {})
      expect(result.success).toBe(false)
      expect(result.error).toContain('path: Required')
      expect(result.error).toContain('content: Expected string')
    })
  })

  describe('#given a failing schema with no issues', () => {
    const schema = {
      safeParse(_input: unknown) {
        return { success: false as const, error: 'Something went wrong' }
      },
    }

    it('#then returns error as string', () => {
      const result = validateToolArgs(schema, {})
      expect(result.success).toBe(false)
      expect(result.error).toBe('Something went wrong')
    })
  })

  describe('#given a failing schema with null error', () => {
    const schema = {
      safeParse(_input: unknown) {
        return { success: false as const, error: null }
      },
    }

    it('#then returns unknown validation error', () => {
      const result = validateToolArgs(schema, {})
      expect(result.success).toBe(false)
      expect(result.error).toBe('Unknown validation error')
    })
  })

  describe('#given a path-less issue', () => {
    const schema = {
      safeParse(_input: unknown) {
        return {
          success: false as const,
          error: { issues: [{ path: [], message: 'Invalid input' }] },
        }
      },
    }

    it('#then formats without path prefix', () => {
      const result = validateToolArgs(schema, {})
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid input')
    })
  })
})
