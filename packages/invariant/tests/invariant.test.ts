import { describe, expect, it } from 'vitest'
import { invariant, InvariantError, setVerbosity } from '../src/invariant'

describe('invariant', () => {
  it('#does not throw when condition is truthy', () => {
    expect(() => invariant(true)).not.toThrow()
    expect(() => invariant(1)).not.toThrow()
    expect(() => invariant('non-empty')).not.toThrow()
    expect(() => invariant({})).not.toThrow()
  })

  it('#throws InvariantError when condition is falsy', () => {
    expect(() => invariant(false)).toThrow(InvariantError)
    expect(() => invariant(0)).toThrow(InvariantError)
    expect(() => invariant(null)).toThrow(InvariantError)
    expect(() => invariant(undefined)).toThrow(InvariantError)
    expect(() => invariant('')).toThrow(InvariantError)
  })

  it('#includes custom message in error', () => {
    expect(() => invariant(false, 'must be truthy')).toThrow('must be truthy')
  })

  it('#supports numeric message', () => {
    expect(() => invariant(false, 42)).toThrow('Invariant Violation: 42')
  })

  it('#supports function condition (callback)', () => {
    expect(() => invariant(() => true)).not.toThrow()
    expect(() => invariant(() => false, 'cb failed')).toThrow('cb failed')
  })

  it('#uses default message when none provided', () => {
    expect(() => invariant(false)).toThrow('Invariant Violation')
  })
})

describe('InvariantError', () => {
  it('#has correct name and framesToPop', () => {
    const err = new InvariantError('test')
    expect(err.name).toBe('Invariant Violation')
    expect(err.framesToPop).toBe(1)
    expect(err.message).toBe('test')
  })

  it('#instanceof Error', () => {
    const err = new InvariantError()
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(InvariantError)
  })

  it('#uses default message when constructed empty', () => {
    const err = new InvariantError()
    expect(err.message).toBe('Invariant Violation')
  })

  it('#formats numeric message', () => {
    const err = new InvariantError(7)
    expect(err.message).toBe('Invariant Violation: 7')
  })
})

describe('setVerbosity', () => {
  it('#returns previous level', () => {
    const prev = setVerbosity('silent')
    expect(typeof prev).toBe('string')
    // Restore
    setVerbosity(prev)
  })

  it('#changes verbosity level', () => {
    const original = setVerbosity('error')
    const current = setVerbosity('debug')
    expect(current).toBe('error')
    // Restore
    setVerbosity(original)
  })

  it('#supports all verbosity levels', () => {
    const levels = ['debug', 'log', 'warn', 'error', 'silent'] as const
    const original = setVerbosity('log')
    for (const level of levels) {
      setVerbosity(level)
    }
    setVerbosity(original)
  })
})

describe('invariant namespace console methods', () => {
  it('#invariant.warn does not throw', () => {
    const prev = setVerbosity('silent')
    expect(() => invariant.warn('test warning')).not.toThrow()
    setVerbosity(prev)
  })

  it('#invariant.error does not throw', () => {
    const prev = setVerbosity('silent')
    expect(() => invariant.error('test error')).not.toThrow()
    setVerbosity(prev)
  })

  it('#invariant.debug does not throw', () => {
    const prev = setVerbosity('silent')
    expect(() => invariant.debug('test debug')).not.toThrow()
    setVerbosity(prev)
  })

  it('#invariant.log does not throw', () => {
    const prev = setVerbosity('silent')
    expect(() => invariant.log('test log')).not.toThrow()
    setVerbosity(prev)
  })
})
