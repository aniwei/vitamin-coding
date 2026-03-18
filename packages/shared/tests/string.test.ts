import { describe, expect, it } from 'vitest'
import { slugify } from '../src/string'

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
