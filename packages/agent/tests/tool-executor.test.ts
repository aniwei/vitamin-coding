// @vitamin/agent tool-executor 测试
import { describe, expect, it } from 'vitest'
import { createToolExecutor } from '../src/tool-executor'
import { DeferredToolManager } from '../src/deferred-tools'

import type { ToolCall } from '@vitamin/ai'
import type { AgentTool, ToolHookExecutor } from '../src/types'

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

function makeToolCall(
  name: string,
  id?: string,
  args: Record<string, unknown> = {},
): ToolCall {
  return {
    type: 'tool_call',
    id: id ?? `call_${name}`,
    name,
    arguments: args,
  }
}

function makeConfirmHook(reason: string): ToolHookExecutor {
  return {
    async executeBeforeHooks(input) {
      return {
        args: input.args,
        cancelled: false,
        cancelReason: `[CONFIRM] ${reason}`,
      }
    },
    async executeAfterHooks(input) {
      return { result: input.result }
    },
  }
}

async function collectEvents(executor: ReturnType<typeof createToolExecutor>, toolCall: ToolCall) {
  const events = []
  for await (const event of executor.executeStream(toolCall, new AbortController().signal)) {
    events.push(event)
  }
  return events
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

  describe('#when execute() requires approval', () => {
    it('#then fails closed when no approval handler is configured', async () => {
      let executed = false
      const tool = makeTool('write', async () => {
        executed = true
        return { content: [{ type: 'text' as const, text: 'written' }] }
      })

      const executor = createToolExecutor([tool], {
        hookExecutor: makeConfirmHook('Confirm write operation?'),
      })

      const result = await executor.execute(makeToolCall('write'), new AbortController().signal)

      expect(result.isError).toBe(true)
      expect(result.content[0]?.text).toContain('requires approval')
      expect(executed).toBe(false)
    })

    it('#then executes after approval handler approves', async () => {
      let executed = false
      const tool = makeTool('write', async () => {
        executed = true
        return { content: [{ type: 'text' as const, text: 'written' }] }
      })

      const executor = createToolExecutor([tool], {
        hookExecutor: makeConfirmHook('Confirm write operation?'),
        approval: async () => true,
      })

      const result = await executor.execute(makeToolCall('write'), new AbortController().signal)

      expect(result.isError).toBeUndefined()
      expect(result.content[0]?.text).toBe('written')
      expect(executed).toBe(true)
    })

    it('#then does not execute when approval handler rejects', async () => {
      let executed = false
      const tool = makeTool('write', async () => {
        executed = true
        return { content: [{ type: 'text' as const, text: 'written' }] }
      })

      const executor = createToolExecutor([tool], {
        hookExecutor: makeConfirmHook('Confirm write operation?'),
        approval: async () => false,
      })

      const result = await executor.execute(makeToolCall('write'), new AbortController().signal)

      expect(result.isError).toBe(true)
      expect(result.content[0]?.text).toContain('rejected by user')
      expect(executed).toBe(false)
    })
  })

  describe('#when executeStream() is used', () => {
    it('#then emits started and result events for successful execution', async () => {
      const executor = createToolExecutor([makeTool('read')])

      const events = await collectEvents(executor, makeToolCall('read'))

      expect(events.map((event) => event.type)).toEqual(['started', 'result'])
      expect(events[0]).toMatchObject({
        type: 'started',
        toolCallId: 'call_read',
        toolName: 'read',
      })
      expect(events[1]).toMatchObject({
        type: 'result',
        toolCallId: 'call_read',
        toolName: 'read',
      })
      expect(events[1]?.type === 'result' ? events[1].result.content[0]?.text : '').toBe(
        'read executed',
      )
    })

    it('#then emits approval lifecycle events when approved', async () => {
      const executor = createToolExecutor([makeTool('write')], {
        hookExecutor: makeConfirmHook('Confirm write operation?'),
        approval: async () => true,
      })

      const events = await collectEvents(executor, makeToolCall('write'))

      expect(events.map((event) => event.type)).toEqual([
        'started',
        'approval_required',
        'approval_resolved',
        'result',
      ])
      expect(events[1]).toMatchObject({
        type: 'approval_required',
        reason: 'Confirm write operation?',
      })
      expect(events[2]).toMatchObject({
        type: 'approval_resolved',
        approved: true,
      })
    })

    it('#then emits approval rejection and error result when rejected', async () => {
      const executor = createToolExecutor([makeTool('write')], {
        hookExecutor: makeConfirmHook('Confirm write operation?'),
        approval: async () => false,
      })

      const events = await collectEvents(executor, makeToolCall('write'))

      expect(events.map((event) => event.type)).toEqual([
        'started',
        'approval_required',
        'approval_resolved',
        'result',
      ])
      expect(events[2]).toMatchObject({
        type: 'approval_resolved',
        approved: false,
      })
      expect(events[3]?.type === 'result' ? events[3].result.isError : false).toBe(true)
    })

    it('#then emits error and result events when tool throws', async () => {
      const tool = makeTool('broken', async () => {
        throw new Error('Disk full')
      })
      const executor = createToolExecutor([tool])

      const events = await collectEvents(executor, makeToolCall('broken'))

      expect(events.map((event) => event.type)).toEqual(['started', 'error', 'result'])
      expect(events[1]).toMatchObject({
        type: 'error',
        message: 'Disk full',
      })
      expect(events[2]?.type === 'result' ? events[2].result.isError : false).toBe(true)
    })

    it('#then emits progress events from tool updates', async () => {
      const tool: AgentTool = {
        name: 'long_task',
        description: 'Long task',
        parameters: createSchema() as never,
        execute: async (ctx) => {
          ctx.onUpdate?.('step 1')
          ctx.onUpdate?.('step 2')
          return { content: [{ type: 'text' as const, text: 'done' }] }
        },
      }
      const executor = createToolExecutor([tool])

      const events = await collectEvents(executor, makeToolCall('long_task'))

      expect(events.map((event) => event.type)).toEqual([
        'started',
        'progress',
        'progress',
        'result',
      ])
      expect(events[1]).toMatchObject({ type: 'progress', update: 'step 1' })
      expect(events[2]).toMatchObject({ type: 'progress', update: 'step 2' })
    })

    it('#then emits side-effect metadata for mutating file tools', async () => {
      const executor = createToolExecutor([makeTool('write')])

      const events = await collectEvents(
        executor,
        makeToolCall('write', 'call_write', { path: 'src/app.ts' }),
      )

      const result = events.find((event) => event.type === 'result')
      expect(result).toMatchObject({
        type: 'result',
        sideEffects: [
          {
            type: 'file',
            action: 'write',
            targets: ['src/app.ts'],
            reversible: true,
            source: 'arguments',
          },
        ],
      })
    })

    it('#then prefers explicit result side-effect metadata', async () => {
      const tool: AgentTool = {
        name: 'apply_patch',
        description: 'Patch tool',
        parameters: createSchema() as never,
        execute: async () => ({
          content: [{ type: 'text' as const, text: 'patched' }],
          details: {
            sideEffects: [
              {
                type: 'file',
                action: 'edit',
                targets: ['src/explicit.ts'],
                reversible: true,
              },
            ],
          },
        }),
      }
      const executor = createToolExecutor([tool])

      const events = await collectEvents(
        executor,
        makeToolCall('apply_patch', 'call_patch', { path: 'src/heuristic.ts' }),
      )

      const result = events.find((event) => event.type === 'result')
      expect(result).toMatchObject({
        type: 'result',
        sideEffects: [
          {
            type: 'file',
            action: 'edit',
            targets: ['src/explicit.ts'],
            reversible: true,
            source: 'result',
          },
        ],
      })
    })

    it('#then skips heuristic side effects for readonly tools', async () => {
      const tool: AgentTool = {
        ...makeTool('read'),
        readonly: true,
      }
      const executor = createToolExecutor([tool])

      const events = await collectEvents(
        executor,
        makeToolCall('read', 'call_read', { path: 'src/app.ts' }),
      )

      const result = events.find((event) => event.type === 'result')
      expect(result?.type === 'result' ? result.sideEffects : []).toBeUndefined()
    })

    it('#then skips heuristic side effects when isReadOnly resolves true', async () => {
      const tool: AgentTool = {
        ...makeTool('maybe_read'),
        isReadOnly: (params) => params.mode === 'read',
      }
      const executor = createToolExecutor([tool])

      const events = await collectEvents(
        executor,
        makeToolCall('maybe_read', 'call_maybe_read', { mode: 'read', path: 'src/app.ts' }),
      )

      const result = events.find((event) => event.type === 'result')
      expect(result?.type === 'result' ? result.sideEffects : []).toBeUndefined()
    })
  })

  describe('#when execute() with an unloaded deferred tool', () => {
    it('#then rejects execution until the tool is loaded', async () => {
      const deferredTool: AgentTool = {
        ...makeTool('notebook_edit'),
        shouldDefer: true,
      }
      const manager = new DeferredToolManager([deferredTool])
      const executor = createToolExecutor([deferredTool], { deferredManager: manager })

      const blocked = await executor.execute(
        makeToolCall('notebook_edit'),
        new AbortController().signal,
      )
      expect(blocked.isError).toBe(true)
      expect(blocked.content[0]?.text).toContain('must be loaded with tool_search')

      manager.markLoaded(['notebook_edit'])
      const allowed = await executor.execute(
        makeToolCall('notebook_edit'),
        new AbortController().signal,
      )
      expect(allowed.isError).toBeUndefined()
      expect(allowed.content[0]?.text).toBe('notebook_edit executed')
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
