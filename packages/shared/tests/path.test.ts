import { describe, expect, it } from 'vitest'
import { getThirdPartyToolBinaryPath, normalizePath } from '../src/path'

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

describe('getThirdPartyToolBinaryPath', () => {
  describe('#given a tool name', () => {
    it('#then returns a tool path ending with that tool name', () => {
      const result = getThirdPartyToolBinaryPath('fd')
      expect(result.endsWith('/fd')).toBe(true)
    })
  })
})
