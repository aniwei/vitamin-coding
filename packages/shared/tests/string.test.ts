import { describe, expect, it } from 'vitest'
import { estimateTokens, slugify, truncate, truncateToTokenBudget } from '../src/string'

describe('truncate', () => {
  describe('#given a short string', () => {
    it('#then returns it unchanged', () => {
      expect(truncate('hello', 10)).toBe('hello')
    })
  })

  describe('#given a string exceeding maxLength', () => {
    it('#then truncates with default suffix', () => {
      const result = truncate('hello world', 8)
      expect(result.length).toBeLessThanOrEqual(8)
      expect(result).toContain('…')
    })

    it('#then truncates with custom suffix', () => {
      const result = truncate('hello world', 8, '...')
      expect(result.length).toBeLessThanOrEqual(8)
      expect(result.endsWith('...')).toBe(true)
    })
  })
})

describe('slugify', () => {
  describe('#given various inputs', () => {
    it('#then converts to kebab-case', () => {
      expect(slugify('Hello World!')).toBe('hello-world')
    })

    it('#then handles multiple spaces and underscores', () => {
      expect(slugify('foo  bar_baz')).toBe('foo-bar-baz')
    })

    it('#then removes special characters', () => {
      expect(slugify('hello@world#test')).toBe('helloworldtest')
    })

    it('#then trims leading/trailing hyphens', () => {
      expect(slugify('--hello--')).toBe('hello')
    })
  })
})

describe('estimateTokens', () => {
  describe('#given English text', () => {
    it('#then estimates ~4 chars per token', () => {
      const text = 'a'.repeat(100)
      expect(estimateTokens(text)).toBe(25)
    })
  })

  describe('#given CJK text', () => {
    it('#then estimates ~2 chars per token', () => {
      const text = '你好世界测试文本'
      expect(estimateTokens(text)).toBe(4)
    })
  })

  describe('#given mixed text', () => {
    it('#then handles both correctly', () => {
      const tokens = estimateTokens('hello你好')
      expect(tokens).toBeGreaterThan(0)
    })
  })
})

describe('truncateToTokenBudget', () => {
  describe('#given text within budget', () => {
    it('#then returns unchanged', () => {
      expect(truncateToTokenBudget('short', 100)).toBe('short')
    })
  })

  describe('#given text exceeding budget', () => {
    it('#then truncates', () => {
      const long = 'a'.repeat(1000)
      const result = truncateToTokenBudget(long, 10)
      expect(result.length).toBeLessThan(1000)
      expect(result).toContain('[truncated]')
    })
  })
})
