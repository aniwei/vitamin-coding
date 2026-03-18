import { describe, expect, it } from 'vitest'
import { normalizePath, resolvePath } from '../src/path'

describe('normalizePath', () => {
  describe('#given a path with backslashes and double dots', () => {
    it('#then normalizes to forward slashes', () => {
      const result = normalizePath('/foo/bar/../baz')
      expect(result).toBe('/foo/baz')
    })
  })

  describe('#given a clean path', () => {
    it('#then returns it unchanged', () => {
      expect(normalizePath('/foo/bar')).toBe('/foo/bar')
    })
  })
})

describe('resolvePath', () => {
  describe('#given relative segments', () => {
    it('#then returns an absolute path', () => {
      const result = resolvePath('/base', 'sub', 'file.ts')
      expect(result).toBe('/base/sub/file.ts')
    })
  })
})
