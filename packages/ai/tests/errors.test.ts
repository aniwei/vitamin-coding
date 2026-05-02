import { describe, expect, it } from 'vitest'
import { PromptTooLongError, isPromptTooLong } from '../src/errors'

describe('PromptTooLongError', () => {
  describe('#given a message', () => {
    it('#then has correct code and name', () => {
      const err = new PromptTooLongError('context exceeded')
      expect(err.name).toBe('PromptTooLongError')
      expect(err.code).toBe('PROMPT_TOO_LONG')
      expect(err.message).toBe('context exceeded')
    })
  })

  describe('#given a tokenCount', () => {
    it('#then stores token count', () => {
      const err = new PromptTooLongError('too long', { tokenCount: 250_000 })
      expect(err.tokenCount).toBe(250_000)
    })
  })

  describe('#given a cause', () => {
    it('#then preserves cause chain', () => {
      const cause = new Error('API 400')
      const err = new PromptTooLongError('too long', { cause })
      expect(err.cause).toBe(cause)
    })
  })
})

describe('isPromptTooLong', () => {
  it('#then returns true for PromptTooLongError', () => {
    expect(isPromptTooLong(new PromptTooLongError('test'))).toBe(true)
  })

  it('#then returns false for generic Error', () => {
    expect(isPromptTooLong(new Error('test'))).toBe(false)
  })

  it('#then returns false for null/undefined', () => {
    expect(isPromptTooLong(null)).toBe(false)
    expect(isPromptTooLong(undefined)).toBe(false)
  })
})
