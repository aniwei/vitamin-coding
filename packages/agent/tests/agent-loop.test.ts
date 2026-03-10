import {
  type AssistantMessage,
  type Message,
  type Model,
  type ToolCall,
  type ToolResultMessage,
  createEventStream,
} from '@vitamin/ai'
import { describe, expect, it } from 'vitest'

import { agentLoop } from '../src/agent-loop'
import { MaxToolTurnsError } from '../src/errors'
import { createToolExecutor } from '../src/tool-executor'

import type { AgentEvent, AgentLoopConfig, AgentMessage, AgentTool } from '../src/types'

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

function makeUserMessage(content: string): Message {
  return { role: 'user', content, timestamp: Date.now() }
}

function makeAssistantMessage(
  content: AssistantMessage['content'],
  stopReason: AssistantMessage['stopReason'],
): AssistantMessage {
  return {
    role: 'assistant',
    content,
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

function makeTool(name: string, executeText: string): AgentTool {
  return {
    name,
    description: `tool:${name}`,
    parameters: createSchema<Record<string, unknown>>(),
    async execute() {
      return { content: [{ type: 'text' as const, text: executeText }] }
    },
  }
}

function createConfig(overrides?: Partial<AgentLoopConfig>): AgentLoopConfig {
  return {
    model: makeModel(),
    systemPrompt: 'you are helpful',
    convertToLlm: async (messages) => messages as Message[],
    getSteeringMessages: async () => [],
    getFollowUpMessages: async () => [],
    maxToolTurns: 25,
    ...overrides,
  }
}

describe('agentLoop', () => {
  describe('#given steering messages arrive before tool execution', () => {
    describe('#when assistant emits tool calls', () => {
      it('#then injects steering and skips pending tool execution', async () => {
        const messages: AgentMessage[] = [makeUserMessage('start')]
        const events: AgentEvent[] = []
        const streamCalls: AssistantMessage[] = [
          makeAssistantMessage(
            [makeToolCall('alpha', 'tc_1', { q: 1 }), makeToolCall('alpha', 'tc_2', { q: 2 })],
            'tool_use',
          ),
          makeAssistantMessage([{ type: 'text', text: 'done' }], 'end_turn'),
        ]
        let streamIndex = 0
        let steeringReturned = false

        const result = await agentLoop({
          messages,
          config: createConfig({
            getSteeringMessages: async () => {
              if (!steeringReturned) {
                steeringReturned = true
                return [makeUserMessage('new direction')]
              }
              return []
            },
          }),
          toolExecutor: createToolExecutor([makeTool('alpha', 'tool ok')]),
          streamFn: (_context, _signal) => {
            const eventStream = createEventStream<
              import('@vitamin/ai').StreamEvent,
              AssistantMessage
            >()
            const message = streamCalls[streamIndex++]
            setTimeout(() => {
              if (!message) return
              eventStream.push({ type: 'start', partial: message })
              eventStream.complete(message)
            }, 0)
            return eventStream
          },
          signal: new AbortController().signal,
          emit: (event) => events.push(event),
        })

        expect(result.stopReason).toBe('end_turn')
        expect(events.some((e) => e.type === 'steering_injected')).toBe(true)
        expect(events.some((e) => e.type === 'tool_call_start')).toBe(false)
        expect(messages.some((m) => m.role === 'user' && m.content === 'new direction')).toBe(true)
      })
    })
  })

  describe('#given follow-up messages after end_turn', () => {
    describe('#when outer loop checks follow-up queue', () => {
      it('#then starts a new turn with follow-up context', async () => {
        const messages: AgentMessage[] = [makeUserMessage('start')]
        const events: AgentEvent[] = []
        let streamCount = 0
        let followUpTaken = false

        const result = await agentLoop({
          messages,
          config: createConfig({
            getFollowUpMessages: async () => {
              if (!followUpTaken) {
                followUpTaken = true
                return [makeUserMessage('follow-up ask')]
              }
              return []
            },
          }),
          toolExecutor: createToolExecutor([]),
          streamFn: (_context, _signal) => {
            const eventStream = createEventStream<
              import('@vitamin/ai').StreamEvent,
              AssistantMessage
            >()
            const responseText = streamCount === 0 ? 'first' : 'second'
            const message = makeAssistantMessage([{ type: 'text', text: responseText }], 'end_turn')
            streamCount++
            setTimeout(() => {
              eventStream.push({ type: 'start', partial: message })
              eventStream.complete(message)
            }, 0)
            return eventStream
          },
          signal: new AbortController().signal,
          emit: (event) => events.push(event),
        })

        expect(result.content[0]).toEqual({ type: 'text', text: 'second' })
        expect(streamCount).toBe(2)
        expect(events.some((e) => e.type === 'follow_up_start')).toBe(true)
      })
    })
  })

  describe('#given maxToolTurns is very small', () => {
    describe('#when model keeps requiring tools', () => {
      it('#then throws MaxToolTurnsError to stop loop', async () => {
        const messages: AgentMessage[] = [makeUserMessage('start')]
        const toolAssistant = makeAssistantMessage(
          [makeToolCall('alpha', 'tc_1', { n: 1 })],
          'tool_use',
        )

        await expect(
          agentLoop({
            messages,
            config: createConfig({ maxToolTurns: 0 }),
            toolExecutor: createToolExecutor([makeTool('alpha', 'tool ok')]),
            streamFn: (_context, _signal) => {
              const eventStream = createEventStream<
                import('@vitamin/ai').StreamEvent,
                AssistantMessage
              >()
              setTimeout(() => {
                eventStream.push({ type: 'start', partial: toolAssistant })
                eventStream.complete(toolAssistant)
              }, 0)
              return eventStream
            },
            signal: new AbortController().signal,
            emit: () => undefined,
          }),
        ).rejects.toBeInstanceOf(MaxToolTurnsError)
      })
    })
  })

  describe('#given tool execution throws error', () => {
    describe('#when loop handles tool result', () => {
      it('#then records tool_result as isError and continues to final answer', async () => {
        const messages: AgentMessage[] = [makeUserMessage('start')]
        const events: AgentEvent[] = []
        let streamCount = 0

        const brokenTool: AgentTool = {
          name: 'broken',
          description: 'broken tool',
          parameters: createSchema<Record<string, unknown>>(),
          async execute() {
            throw new Error('boom')
          },
        }

        const result = await agentLoop({
          messages,
          config: createConfig(),
          toolExecutor: createToolExecutor([brokenTool]),
          streamFn: (_context, _signal) => {
            const eventStream = createEventStream<
              import('@vitamin/ai').StreamEvent,
              AssistantMessage
            >()
            const message =
              streamCount === 0
                ? makeAssistantMessage([makeToolCall('broken', 'tc_err')], 'tool_use')
                : makeAssistantMessage([{ type: 'text', text: 'recovered' }], 'end_turn')
            streamCount++
            setTimeout(() => {
              eventStream.push({ type: 'start', partial: message })
              eventStream.complete(message)
            }, 0)
            return eventStream
          },
          signal: new AbortController().signal,
          emit: (event) => events.push(event),
        })

        const toolResultMessage = messages.find(
          (message): message is ToolResultMessage =>
            message.role === 'tool_result' && message.toolCallId === 'tc_err',
        )

        expect(result.content[0]).toEqual({ type: 'text', text: 'recovered' })
        expect(toolResultMessage).toBeDefined()
        expect(toolResultMessage?.isError).toBe(true)
        expect(
          events.some(
            (event) =>
              event.type === 'tool_call_end' &&
              event.toolCall.id === 'tc_err' &&
              event.result.isError === true,
          ),
        ).toBe(true)
      })
    })
  })
})
