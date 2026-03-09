import { describe, expect, it } from 'vitest'
import { parseJsonc, safeStringify } from '../src/json'

describe('parseJsonc', () => {
  describe('#given valid JSON', () => {
    it('#then parses normally', () => {
      expect(parseJsonc('{"a": 1}')).toEqual({ a: 1 })
    })
  })

  describe('#given JSON with line comments', () => {
    it('#then strips // comments and parses', () => {
      const input = `{
        // this is a comment
        "key": "value"
      }`
      expect(parseJsonc(input)).toEqual({ key: 'value' })
    })
  })

  describe('#given JSON with block comments', () => {
    it('#then strips /* */ comments and parses', () => {
      const input = `{
        /* block comment */
        "key": "value"
      }`
      expect(parseJsonc(input)).toEqual({ key: 'value' })
    })
  })

  describe('#given JSON with trailing commas', () => {
    it('#then removes trailing commas before } and ]', () => {
      const input = `{
        "arr": [1, 2, 3,],
        "key": "value",
      }`
      expect(parseJsonc(input)).toEqual({ arr: [1, 2, 3], key: 'value' })
    })
  })

  describe('#given JSON with mixed comments and trailing commas', () => {
    it('#then handles all together', () => {
      const input = `{
        // comment
        "a": 1,
        /* another */
        "b": [
          "x", // inline
          "y",
        ],
      }`
      expect(parseJsonc(input)).toEqual({ a: 1, b: ['x', 'y'] })
    })
  })

  describe('#given comments inside strings', () => {
    it('#then preserves comment-like content in strings', () => {
      const input = '{"url": "https://example.com/path"}'
      expect(parseJsonc(input)).toEqual({ url: 'https://example.com/path' })
    })
  })
})

describe('safeStringify', () => {
  describe('#given a normal object', () => {
    it('#then returns valid JSON', () => {
      expect(safeStringify({ a: 1 })).toBe('{"a":1}')
    })
  })

  describe('#given an object with circular references', () => {
    it('#then replaces circular refs with [Circular]', () => {
      const obj: Record<string, unknown> = { a: 1 }
      obj.self = obj
      const result = safeStringify(obj)
      expect(result).toContain('[Circular]')
      expect(() => JSON.parse(result)).not.toThrow()
    })
  })

  describe('#given an indent option', () => {
    it('#then formats with indentation', () => {
      const result = safeStringify({ a: 1 }, 2)
      expect(result).toContain('\n')
    })
  })
})
