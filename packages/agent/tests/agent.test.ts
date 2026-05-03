// @x-mars/agent Agent 状态机测试
import { describe, expect, it } from 'vitest'
import { Agent } from '../src/agent'
import { createEventStream } from '../../ai/src/index'
import { createLogger } from '@x-mars/shared'

import type {
  AssistantMessage,
  Model,
  StreamContext,
  StreamEvent,
  ToolCall,
} from '../../ai/src/index'
import type { AgentTool, ToolHookExecutor } from '../src/types'

function makeModel(): Model {
  return {
    id: 'openai/test-model',
    name: 'test-model',
    api: 'openai-completions',
    provider: 'openai',
    baseUrl: 'https://example.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxOutputTokens: 4096,
  }
}

function makeAssistantMessage(
  content: AssistantMessage['content'],
  stopReason: AssistantMessage['stopReason'],
): AssistantMessage {
  return {
    role: 'assistant',
    content,
    api: 'openai-completions',
    provider: 'openai',
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    stopReason,
    model: 'openai/test-model',
  }
}

function makeToolCall(name: string, id = 'tc_1', args: Record<string, unknown> = {}): ToolCall {
  return {
    type: 'tool_call',
    id,
    name,
    arguments: args,
  }
}

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

function makeStream(responses: AssistantMessage[]) {
  let index = 0
  return (_context: StreamContext, _signal: AbortSignal) => {
    const eventStream = createEventStream<StreamEvent, AssistantMessage>()
    const message = responses[index++]
    setTimeout(() => {
      if (!message) {
        return
      }
      eventStream.push({ type: 'start', partial: message })
      eventStream.complete(message)
    }, 0)
    return eventStream
  }
}

describe('Agent', () => {
  describe('#given a freshly created agent', () => {
    it('#then status is idle', () => {
      const agent = new Agent()
      expect(agent.status).toBe('idle')
    })

    it('#then turnCount is 0', () => {
      const agent = new Agent()
      expect(agent.turnCount).toBe(0)
    })

    it('#then getState() returns idle snapshot', () => {
      const agent = new Agent()
      const state = agent.getState()
      expect(state.status).toBe('idle')
      expect(state.turnCount).toBe(0)
      expect(state.isStreaming).toBe(false)
      expect(state.error).toBeUndefined()
    })
  })

  describe('#given an idle agent', () => {
    describe('#when steer() and followUp() are called', () => {
      it('#then messages are queued without error', () => {
        const agent = new Agent()
        agent.steer({ role: 'user', content: 'steer msg', timestamp: Date.now() })
        agent.followUp({ role: 'user', content: 'followup msg', timestamp: Date.now() })
      })
    })
  })

  describe('#given an idle agent', () => {
    describe('#when abort() is called from idle', () => {
      it('#then emits aborted notification and transitions to aborted', () => {
        const agent = new Agent()

        const statusChanges: Array<{ from: string; to: string }> = []
        let abortedCount = 0

        agent.on('status_change', (event) => {
          statusChanges.push(event as { from: string; to: string })
        })
        agent.on('aborted', () => {
          abortedCount++
        })

        agent.abort()

        expect(abortedCount).toBe(1)
        expect(statusChanges).toContainEqual({ from: 'idle', to: 'aborted' })
        expect(agent.status).toBe('aborted')
      })
    })
  })

  describe('#given an agent after reset', () => {
    describe('#when reset() is called', () => {
      it('#then state returns to idle with cleared data', () => {
        const agent = new Agent()
        agent.steer({ role: 'user', content: 'test', timestamp: Date.now() })
        agent.reset()

        expect(agent.status).toBe('idle')
        expect(agent.turnCount).toBe(0)
      })
    })
  })

  describe('#given event subscription', () => {
    describe('#when on() unsubscribe is called', () => {
      it('#then listener no longer receives events', () => {
        const agent = new Agent()
        let abortedCount = 0
        const unsub = agent.on('aborted', () => {
          abortedCount++
        })

        agent.abort()
        expect(abortedCount).toBe(1)

        unsub()
        agent.abort()
        expect(abortedCount).toBe(1)
      })
    })
  })

  describe('#given a successful run', () => {
    describe('#when the stream returns a final assistant message', () => {
      it('#then tracks status, turn count, and token usage from the loop', async () => {
        const agent = new Agent({
          stream: makeStream([makeAssistantMessage([{ type: 'text', text: 'done' }], 'end_turn')]),
        })

        const messages = [{ role: 'user' as const, content: 'start', timestamp: Date.now() }]

        const result = await agent.run({
          model: makeModel(),
          systemPrompt: 'test',
          tools: [],
          messages,
          logger: createLogger('test-agent'),
        })

        expect(result.content[0]).toEqual({ type: 'text', text: 'done' })
        expect(agent.status).toBe('completed')
        expect(agent.turnCount).toBe(1)
        expect(agent.getState().tokenUsage).toEqual({ input: 10, output: 5, cacheRead: 0 })
      })
    })
  })

  describe('#given agent run with tool hook executor', () => {
    describe('#when assistant calls a tool', () => {
      it('#then forwards hookExecutor, agentName, and sessionId into tool execution', async () => {
        const agent = new Agent({
          stream: makeStream([
            makeAssistantMessage(
              [makeToolCall('echo', 'tc_echo', { value: 'from-model' })],
              'tool_use',
            ),
            makeAssistantMessage([{ type: 'text', text: 'done' }], 'end_turn'),
          ]),
        })

        const hookCalls: Array<{
          phase: 'before' | 'after'
          sessionId: string
          agentName: string
          args?: Record<string, unknown>
        }> = []
        const hookExecutor: ToolHookExecutor = {
          async executeBeforeHooks(input) {
            hookCalls.push({
              phase: 'before',
              sessionId: input.sessionId,
              agentName: input.agentName,
              args: input.args,
            })

            return {
              args: { ...input.args, value: 'from-hook' },
              cancelled: false,
            }
          },
          async executeAfterHooks(input) {
            hookCalls.push({
              phase: 'after',
              sessionId: input.sessionId,
              agentName: input.agentName,
            })

            return {
              result: {
                ...input.result,
                content: [{ type: 'text', text: 'after-hook' }],
              },
              metadata: {},
            }
          },
        }

        const tool: AgentTool = {
          name: 'echo',
          description: 'echo tool',
          parameters: createSchema<Record<string, unknown>>() as never,
          async execute(ctx) {
            return {
              content: [
                { type: 'text', text: String((ctx.params as Record<string, unknown>).value) },
              ],
            }
          },
        }

        const messages = [{ role: 'user' as const, content: 'start', timestamp: Date.now() }]

        await agent.run({
          model: makeModel(),
          systemPrompt: 'test',
          tools: [tool],
          messages,
          toolHookExecutor: hookExecutor,
          agentName: 'primary',
          sessionId: 'session-1',
          logger: createLogger('test-agent'),
        })

        expect(hookCalls).toEqual([
          {
            phase: 'before',
            sessionId: 'session-1',
            agentName: 'primary',
            args: { value: 'from-model' },
          },
          {
            phase: 'after',
            sessionId: 'session-1',
            agentName: 'primary',
          },
        ])

        const toolResultMessage = messages.find((message) => {
          return (
            typeof message === 'object' &&
            message !== null &&
            'role' in message &&
            message.role === 'tool_result'
          )
        }) as { role: 'tool_result'; content: Array<{ type: string; text?: string }> } | undefined

        expect(toolResultMessage?.content[0]?.text).toBe('after-hook')
      })
    })
  })
})
