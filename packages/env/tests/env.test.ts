import { describe, expect, it } from 'vitest'
import { normalizeEnv } from '../src/index'

describe('normalizeEnv', () => {
  it('#given undefined value #then returns defaultValue', () => {
    expect(normalizeEnv(undefined, 42)).toBe(42)
  })

  it('#given a valid numeric string #then parses it', () => {
    expect(normalizeEnv('100', 42)).toBe(100)
  })

  it('#given a non-numeric string #then returns defaultValue', () => {
    expect(normalizeEnv('abc', 42)).toBe(42)
  })

  it('#given zero string #then returns defaultValue (non-positive)', () => {
    expect(normalizeEnv('0', 42)).toBe(42)
  })

  it('#given negative number string #then returns defaultValue', () => {
    expect(normalizeEnv('-5', 42)).toBe(42)
  })

  it('#given empty string #then returns defaultValue', () => {
    expect(normalizeEnv('', 42)).toBe(42)
  })
})
