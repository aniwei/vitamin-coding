// Agent 错误类型覆盖率测试
import { describe, expect, it } from 'vitest'

import { AbortError, AgentLoopError, MaxToolTurnsError, ToolExecutionError } from '../src/errors'

describe('AgentLoopError', () => {
  describe('#given a message', () => {
    describe('#when constructed', () => {
      it('#then has correct name and code', () => {
        const err = new AgentLoopError('loop stuck')
        expect(err.name).toBe('AgentLoopError')
        expect(err.message).toBe('loop stuck')
        expect(err.code).toBe('AGENT_LOOP_ERROR')
      })
    })
  })

  describe('#given a cause', () => {
    describe('#when constructed with cause option', () => {
      it('#then cause is accessible', () => {
        const cause = new Error('inner')
        const err = new AgentLoopError('outer', { cause })
        expect(err.cause).toBe(cause)
      })
    })
  })
})

describe('ToolExecutionError', () => {
  describe('#given tool name and call id', () => {
    describe('#when constructed', () => {
      it('#then has correct properties', () => {
        const err = new ToolExecutionError('bash', 'tc-1', 'command failed')
        expect(err.name).toBe('ToolExecutionError')
        expect(err.toolName).toBe('bash')
        expect(err.toolCallId).toBe('tc-1')
        expect(err.message).toBe('command failed')
        expect(err.code).toBe('AGENT_TOOL_EXECUTION_ERROR')
      })
    })
  })

  describe('#given a cause', () => {
    describe('#when constructed', () => {
      it('#then cause is accessible', () => {
        const cause = new Error('root cause')
        const err = new ToolExecutionError('grep', 'tc-2', 'failed', { cause })
        expect(err.cause).toBe(cause)
      })
    })
  })
})

describe('AbortError', () => {
  describe('#given no message', () => {
    describe('#when constructed', () => {
      it('#then uses default message', () => {
        const err = new AbortError()
        expect(err.name).toBe('AbortError')
        expect(err.message).toBe('Agent aborted')
        expect(err.code).toBe('AGENT_ABORTED')
      })
    })
  })

  describe('#given a custom message', () => {
    describe('#when constructed', () => {
      it('#then uses custom message', () => {
        const err = new AbortError('user cancelled')
        expect(err.message).toBe('user cancelled')
      })
    })
  })
})

describe('MaxToolTurnsError', () => {
  describe('#given a max turns number', () => {
    describe('#when constructed', () => {
      it('#then has correct maxTurns and message', () => {
        const err = new MaxToolTurnsError(50)
        expect(err.name).toBe('MaxToolTurnsError')
        expect(err.maxTurns).toBe(50)
        expect(err.message).toContain('50')
        expect(err.code).toBe('AGENT_MAX_TOOL_TURNS')
      })
    })
  })
})
