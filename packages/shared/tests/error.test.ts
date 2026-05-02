import { describe, expect, it } from 'vitest'
import {
  Error as XMarsError,
  AgentError,
  ConfigError,
  ExtensionError,
  HookError,
  McpError,
  ProviderError,
  SessionError,
  StreamError,
  ToolError,
  isXMarsError,
  serializeError,
} from '../src/error'

describe('XMarsError', () => {
  describe('#given a XMarsError', () => {
    describe('#when constructed with code and message', () => {
      it('#then preserves code, message, and name', () => {
        const error = new XMarsError('test message', { code: 'TEST_001' })
        expect(error.message).toBe('test message')
        expect(error.code).toBe('TEST_001')
        expect(error.name).toBe('Error')
        expect(error).toBeInstanceOf(Error)
        expect(error).toBeInstanceOf(XMarsError)
      })

      it('#then captures stack trace', () => {
        const error = new XMarsError('stack test', { code: 'STACK_001' })
        expect(error.stack).toBeDefined()
        expect(error.stack).toContain('stack test')
      })
    })

    describe('#when constructed with a cause', () => {
      it('#then preserves the cause chain', () => {
        const cause = new Error('root cause')
        const error = new XMarsError('wrapped', {
          code: 'WRAP_001',
          cause,
        })
        expect(error.cause).toBe(cause)
      })
    })

    describe('#when constructed with metadata and retryable', () => {
      it('#then exposes structured fields and JSON serialization', () => {
        const cause = new Error('temporary failure')
        const error = new XMarsError('wrapped', {
          code: 'WRAP_RETRY',
          cause,
          retryable: true,
          metadata: { provider: 'test', attempt: 2 },
        })

        expect(error.retryable).toBe(true)
        expect(error.metadata).toEqual({ provider: 'test', attempt: 2 })
        expect(error.toJSON()).toEqual({
          name: 'Error',
          message: 'wrapped',
          code: 'WRAP_RETRY',
          retryable: true,
          metadata: { provider: 'test', attempt: 2 },
          cause: { name: 'Error', message: 'temporary failure' },
        })
      })
    })
  })

  describe('#serializeError', () => {
    it('#then serializes X-Mars errors with code and metadata', () => {
      const error = new ToolError('blocked', {
        code: 'TOOL_BLOCKED',
        metadata: { tool: 'web_fetch' },
      })

      expect(isXMarsError(error)).toBe(true)
      expect(serializeError(error)).toMatchObject({
        name: 'ToolError',
        message: 'blocked',
        code: 'TOOL_BLOCKED',
        metadata: { tool: 'web_fetch' },
      })
    })

    it('#then serializes unknown errors with a fallback code', () => {
      expect(serializeError(new Error('boom'))).toEqual({
        name: 'Error',
        message: 'boom',
        code: 'UNKNOWN_ERROR',
      })
      expect(serializeError('boom')).toEqual({
        name: 'Error',
        message: 'boom',
        code: 'UNKNOWN_ERROR',
      })
    })
  })
})

describe('Error subclasses', () => {
  const testCases: Array<{
    name: string
    ErrorClass: new (msg: string, opts: { code: string; cause?: Error }) => XMarsError
  }> = [
    { name: 'ConfigError', ErrorClass: ConfigError },
    { name: 'ProviderError', ErrorClass: ProviderError },
    { name: 'StreamError', ErrorClass: StreamError },
    { name: 'AgentError', ErrorClass: AgentError },
    { name: 'ToolError', ErrorClass: ToolError },
    { name: 'HookError', ErrorClass: HookError },
    { name: 'SessionError', ErrorClass: SessionError },
    { name: 'ExtensionError', ErrorClass: ExtensionError },
    { name: 'McpError', ErrorClass: McpError },
  ]

  for (const { name, ErrorClass } of testCases) {
    describe(`#given ${name}`, () => {
      it('#then is instanceof XMarsError and Error', () => {
        const error = new ErrorClass('test', { code: 'TEST_001' })
        expect(error).toBeInstanceOf(XMarsError)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe(name)
      })
    })
  }
})
