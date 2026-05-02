import { describe, expect, it } from 'vitest'
import {
  normalizePath,
  getThirdPartyToolDir,
  getThirdPartyToolBinaryDir,
  getXMarsHomeDir,
  getXMarsProjectDir,
  createTempLoggerDir,
  createTempLoggerPath,
} from '../src/path'

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

describe('getThirdPartyToolBinaryDir', () => {
  describe('#given a tool name', () => {
    it('#then returns a tool path ending with that tool name', () => {
      const result = getThirdPartyToolBinaryDir('fd')
      expect(result.endsWith('/fd')).toBe(true)
    })
  })

  describe('#given a tool name and version', () => {
    it('#then returns a path including tool name and version', () => {
      const result = getThirdPartyToolBinaryDir('fd', '10.2.0')
      expect(result).toContain('/fd/')
      expect(result.endsWith('/10.2.0')).toBe(true)
    })
  })
})

describe('getThirdPartyToolDir', () => {
  it('#returns a path under xMars home', () => {
    const dir = getThirdPartyToolDir()
    expect(dir).toContain('tools')
  })
})

describe('getXMarsHomeDir', () => {
  it('#returns a non-empty string', () => {
    expect(typeof getXMarsHomeDir()).toBe('string')
    expect(getXMarsHomeDir().length).toBeGreaterThan(0)
  })
})

describe('getXMarsProjectDir', () => {
  it('#returns a non-empty string', () => {
    expect(typeof getXMarsProjectDir()).toBe('string')
    expect(getXMarsProjectDir().length).toBeGreaterThan(0)
  })
})

describe('createTempLoggerDir', () => {
  it('#returns a temp path with x-mars-coding prefix', () => {
    const result = createTempLoggerDir()
    expect(result).toContain('x-mars-coding-')
    expect(result.endsWith('.log')).toBe(true)
  })

  it('#createTempLoggerPath is an alias', () => {
    const a = createTempLoggerPath()
    expect(a).toContain('x-mars-coding-')
  })
})
