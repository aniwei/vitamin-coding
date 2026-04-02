// @vitamin/agent tool-executor 测试
import { describe, expect, it } from 'vitest'
import { createToolExecutor } from '../src/tool-executor'

import type { ToolCall } from '@vitamin/ai'
import type { AgentTool } from '../src/types'

// 简单 Zod-like schema stub
function createSchema<T>() {
  return {
    parse(input: unknown) {
      return input as T
    },
    safeParse(input: unknown) {
      return { success: true as const, data: input as T }
    },
  }
}

function createFailSchema(message: string) {
  return {
    safeParse(_input: unknown) {
      return {
        success: false as const,
        error: { issues: [{ path: [], message }] },
      }
    },
  }
}

// 工具工厂
function makeTool(
  name: string,
  handler?: (id: string, params: unknown) => Promise<unknown>,
): AgentTool {
  return {
    name,
    description: `Test tool: ${name}`,
    parameters: createSchema() as never,
    execute: async (ctx) => {
      if (handler) {
        const result = await handler(ctx.id, ctx.params)
        return result as { content: { type: 'text'; text: string }[]; isError?: boolean }
      }
      return { content: [{ type: 'text' as const, text: `${name} executed` }] }
    },
  }
}

function makeToolCall(name: string, id?: string): ToolCall {
  return {
    type: 'tool_call',
    id: id ?? `call_${name}`,
    name,
    arguments: {},
  }
}

describe('ToolExecutor', () => {
  describe('#given executor with registered tools', () => {
    describe('#when execute() with known tool', () => {
      it('#then returns successful result', async () => {
        const executor = createToolExecutor([makeTool('read')])
        const result = await executor.execute(makeToolCall('read'), new AbortController().signal)
        expect(result.isError).toBeUndefined()
        expect(result.content[0]?.text).toBe('read executed')
      })
    })

    describe('#when execute() with unknown tool', () => {
      it('#then returns isError result', async () => {
        const executor = createToolExecutor([makeTool('read')])
        const result = await executor.execute(
          makeToolCall('nonexistent'),
          new AbortController().signal,
        )
        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toContain('Unknown tool')
      })
    })

    describe('#when execute() with validation failure', () => {
      it('#then returns isError with validation message', async () => {
        const tool: AgentTool = {
          name: 'strict',
          description: 'Strict tool',
          parameters: createFailSchema('path is required') as never,
          execute: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
        }
        const executor = createToolExecutor([tool])
        const result = await executor.execute(makeToolCall('strict'), new AbortController().signal)
        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toContain('Invalid arguments')
      })
    })

    describe('#when execute() and tool throws', () => {
      it('#then wraps error as isError result', async () => {
        const tool = makeTool('broken', async () => {
          throw new Error('Disk full')
        })
        const executor = createToolExecutor([tool])
        const result = await executor.execute(makeToolCall('broken'), new AbortController().signal)
        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toContain('Disk full')
      })
    })
  })

  describe('#when list() is called', () => {
    it('#then returns all registered tools', () => {
      const executor = createToolExecutor([makeTool('a'), makeTool('b')])
      expect(executor.list()).toHaveLength(2)
    })
  })

  describe('#when executeParallel() with multiple calls', () => {
    it('#then all results are in the map', async () => {
      const executor = createToolExecutor([makeTool('a'), makeTool('b')])
      const results = await executor.executeParallel(
        [makeToolCall('a', 'c1'), makeToolCall('b', 'c2')],
        new AbortController().signal,
      )
      expect(results.size).toBe(2)
      expect(results.get('c1')?.content[0]?.text).toBe('a executed')
      expect(results.get('c2')?.content[0]?.text).toBe('b executed')
    })
  })

  describe('#when execute() with runtime context metadata', () => {
    it('#then passes sessionId and agentName to the tool', async () => {
      let received:
        | {
            sessionId?: string
            agentName?: string
          }
        | undefined

      const tool: AgentTool = {
        name: 'contextual',
        description: 'Contextual tool',
        parameters: createSchema() as never,
        execute: async (ctx) => {
          received = {
            sessionId: ctx.sessionId,
            agentName: ctx.agentName,
          }
          return { content: [{ type: 'text' as const, text: 'ok' }] }
        },
      }

      const executor = createToolExecutor([tool], {
        sessionId: 'lead-session-1',
        agentName: 'lead',
      })

      const result = await executor.execute(makeToolCall('contextual'), new AbortController().signal)

      expect(result.isError).toBeUndefined()
      expect(received).toEqual({
        sessionId: 'lead-session-1',
        agentName: 'lead',
      })
    })
  })

  describe('#when executeSequential() without steering', () => {
    it('#then executes all calls and collects results', async () => {
      const executor = createToolExecutor([makeTool('x')])
      const collected: string[] = []
      const { results, steeringMessages } = await executor.executeSequential(
        [makeToolCall('x', 'c1'), makeToolCall('x', 'c2')],
        new AbortController().signal,
        (tc, _result) => collected.push(tc.id),
        async () => [],
      )
      expect(results.size).toBe(2)
      expect(steeringMessages).toHaveLength(0)
      expect(collected).toEqual(['c1', 'c2'])
    })
  })

  describe('#when executeSequential() with steering interrupt', () => {
    it('#then stops early and returns steering messages', async () => {
      const executor = createToolExecutor([makeTool('x')])
      let callCount = 0
      const { results, steeringMessages } = await executor.executeSequential(
        [makeToolCall('x', 'c1'), makeToolCall('x', 'c2'), makeToolCall('x', 'c3')],
        new AbortController().signal,
        () => {
          callCount++
        },
        async () => {
          // 第一次调用后返回 steering 中断
          if (callCount >= 1) {
            return [{ role: 'user' as const, content: 'stop', timestamp: Date.now() }]
          }
          return []
        },
      )

      // 第一个 tool 执行完毕，第二次 checkSteering 返回中断
      expect(results.size).toBe(1)
      expect(steeringMessages).toHaveLength(1)
    })
  })
})
