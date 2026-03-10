import { describe, expect, it } from 'vitest'
import {
  Error as VitaminError,
  AgentError,
  ConfigError,
  ExtensionError,
  HookError,
  McpError,
  ProviderError,
  SessionError,
  StreamError,
  ToolError,
} from '../src/error'

describe('VitaminError', () => {
  describe('#given a VitaminError', () => {
    describe('#when constructed with code and message', () => {
      it('#then preserves code, message, and name', () => {
        const error = new VitaminError('test message', { code: 'TEST_001' })
        expect(error.message).toBe('test message')
        expect(error.code).toBe('TEST_001')
        expect(error.name).toBe('Error')
        expect(error).toBeInstanceOf(Error)
        expect(error).toBeInstanceOf(VitaminError)
      })

      it('#then captures stack trace', () => {
        const error = new VitaminError('stack test', { code: 'STACK_001' })
        expect(error.stack).toBeDefined()
        expect(error.stack).toContain('stack test')
      })
    })

    describe('#when constructed with a cause', () => {
      it('#then preserves the cause chain', () => {
        const cause = new Error('root cause')
        const error = new VitaminError('wrapped', {
          code: 'WRAP_001',
          cause,
        })
        expect(error.cause).toBe(cause)
      })
    })
  })
})

describe('Error subclasses', () => {
  const testCases: Array<{
    name: string
    ErrorClass: new (msg: string, opts: { code: string; cause?: Error }) => VitaminError
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
      it('#then is instanceof VitaminError and Error', () => {
        const error = new ErrorClass('test', { code: 'TEST_001' })
        expect(error).toBeInstanceOf(VitaminError)
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe(name)
      })
    })
  }
})
