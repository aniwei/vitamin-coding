import {
  type AssistantMessage,
  type Message,
  type Model,
  type StreamContext,
  type StreamEvent,
  type ToolCall,
  PromptTooLongError,
  createEventStream,
} from '../../ai/src/index'
import { describe, expect, it } from 'vitest'
import { createLogger } from '../../shared/src/index'

import { workLoop } from '../src/work-loop'
import { AbortError, MaxToolTurnsError } from '../src/errors'
import { createToolExecutor } from '../src/tool-executor'

import type { AgentEvent, AgentLoopContext, AgentMessage, AgentTool } from '../src/types'

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

function makeTool(name: string, executeText: string): AgentTool {
  return {
    name,
    description: `tool:${name}`,
    parameters: createSchema<Record<string, unknown>>(),
    async execute(_ctx) {
      return { content: [{ type: 'text' as const, text: executeText }] }
    },
  }
}

function createRuntime(overrides?: Partial<AgentLoopContext>): AgentLoopContext {
  return {
    model: makeModel(),
    systemPrompt: 'you are helpful',
    logger: createLogger('agent-loop-test', { level: 'silent' }),
    convertToLLM: async (messages) => messages as Message[],
    getSteeringMessages: async () => [],
    getFollowUpMessages: async () => [],
    maxToolTurns: 25,
    ...overrides,
  }
}

function makeStream(responses: AssistantMessage[]) {
  let index = 0
  return (_context: StreamContext, _signal: AbortSignal) => {
    const eventStream = createEventStream<StreamEvent, AssistantMessage>()
    const message = responses[index++]
    setTimeout(() => {
      if (!message) return
      eventStream.push({ type: 'start', partial: message })
      eventStream.complete(message)
    }, 0)
    return eventStream
  }
}

function makeFailingStream(error: Error) {
  return () => {
    throw error
  }
}

describe('workLoop', () => {
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
        let steeringReturned = false

        const result = await workLoop({
          messages,
          ...createRuntime({
            getSteeringMessages: async () => {
              if (!steeringReturned) {
                steeringReturned = true
                return [makeUserMessage('new direction')]
              }
              return []
            },
          }),
          toolExecutor: createToolExecutor([makeTool('alpha', 'tool ok')]),
          stream: makeStream(streamCalls),
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

        const result = await workLoop({
          messages,
          ...createRuntime({
            getFollowUpMessages: async () => {
              if (!followUpTaken) {
                followUpTaken = true
                return [makeUserMessage('follow-up ask')]
              }
              return []
            },
          }),
          toolExecutor: createToolExecutor([]),
          stream: (_context, _signal) => {
            const responseText = streamCount === 0 ? 'first' : 'second'
            streamCount++
            return makeStream([
              makeAssistantMessage([{ type: 'text', text: responseText }], 'end_turn'),
            ])(_context, _signal)
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
          workLoop({
            messages,
            ...createRuntime({ maxToolTurns: 0 }),
            toolExecutor: createToolExecutor([makeTool('alpha', 'tool ok')]),
            stream: makeStream([toolAssistant]),
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

        const brokenTool: AgentTool = {
          name: 'broken',
          description: 'broken tool',
          parameters: createSchema<Record<string, unknown>>(),
          async execute() {
            throw new Error('boom')
          },
        }

        const result = await workLoop({
          messages,
          ...createRuntime(),
          toolExecutor: createToolExecutor([brokenTool]),
          stream: makeStream([
            makeAssistantMessage([makeToolCall('broken', 'tc_err')], 'tool_use'),
            makeAssistantMessage([{ type: 'text', text: 'recovered' }], 'end_turn'),
          ]),
          signal: new AbortController().signal,
          emit: (event) => events.push(event),
        })

        const toolResultMessage = messages.find((message) => {
          return (
            typeof message === 'object' &&
            message !== null &&
            'role' in message &&
            message.role === 'tool_result' &&
            'toolCallId' in message &&
            message.toolCallId === 'tc_err'
          )
        }) as
          | { role: 'tool_result'; toolCallId: string; content: Array<{ type: string; text?: string }>; isError?: boolean }
          | undefined

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

  describe('#given no stream function in runtime', () => {
    describe('#when workLoop starts', () => {
      it('#then throws missing stream error immediately', async () => {
        await expect(
          workLoop({
            ...createRuntime(),
            messages: [makeUserMessage('start')],
            toolExecutor: createToolExecutor([]),
            stream: undefined,
            signal: new AbortController().signal,
            emit: () => undefined,
          }),
        ).rejects.toThrow('Agent loop requires stream function via options.stream')
      })
    })
  })

  describe('#given provider reports prompt-too-long', () => {
    describe('#when reactive compaction changes the context', () => {
      it('#then retries with compacted messages and emits recovery metadata', async () => {
        const messages: AgentMessage[] = [makeUserMessage('too much context')]
        const events: AgentEvent[] = []
        const transformCalls: Array<{ reason?: string; attempt?: number; count: number }> = []
        let streamAttempt = 0

        const result = await workLoop({
          messages,
          ...createRuntime({
            transformContext: async (input, _signal, options) => {
              transformCalls.push({
                reason: options?.reason,
                attempt: options?.attempt,
                count: input.length,
              })

              if (options?.reason !== 'prompt-too-long') {
                return input
              }

              return {
                messages: [makeUserMessage('compacted context')],
                metadata: {
                  contextBudget: {
                    strategies: ['prune', 'micro-compact'],
                    tokensSaved: 1200,
                  },
                },
              }
            },
          }),
          toolExecutor: createToolExecutor([]),
          stream: (context, signal) => {
            streamAttempt++
            if (streamAttempt === 1) {
              return makeFailingStream(new PromptTooLongError('context-too-long', { tokenCount: 130000 }))(
                context,
                signal,
              )
            }
            return makeStream([makeAssistantMessage([{ type: 'text', text: 'recovered' }], 'end_turn')])(
              context,
              signal,
            )
          },
          signal: new AbortController().signal,
          emit: (event) => events.push(event),
        })

        const compactionEvent = events.find((event) => event.type === 'compaction_needed')

        expect(result.content[0]).toEqual({ type: 'text', text: 'recovered' })
        expect(streamAttempt).toBe(2)
        expect(messages[0]).toMatchObject({ role: 'user', content: 'compacted context' })
        expect(transformCalls).toEqual([
          { reason: 'preflight', attempt: undefined, count: 1 },
          { reason: 'prompt-too-long', attempt: 1, count: 1 },
          { reason: 'preflight', attempt: undefined, count: 1 },
        ])
        expect(compactionEvent).toMatchObject({
          type: 'compaction_needed',
          tokenCount: 130000,
          threshold: 128000,
          attempt: 1,
          maxAttempts: 2,
          beforeCount: 1,
          afterCount: 1,
          metadata: {
            contextBudget: {
              strategies: ['prune', 'micro-compact'],
              tokensSaved: 1200,
            },
          },
        })
      })
    })

    describe('#when compaction cannot get under provider limits', () => {
      it('#then stops after max retry attempts and rethrows prompt-too-long', async () => {
        const messages: AgentMessage[] = [makeUserMessage('too much context')]
        let streamAttempt = 0
        let reactiveCompactions = 0

        await expect(
          workLoop({
            messages,
            ...createRuntime({
              transformContext: async (input, _signal, options) => {
                if (options?.reason !== 'prompt-too-long') {
                  return input
                }
                reactiveCompactions++
                return [makeUserMessage(`compacted-${reactiveCompactions}`)]
              },
            }),
            maxPromptTooLongRetries: 1,
            toolExecutor: createToolExecutor([]),
            stream: (context, signal) => {
              streamAttempt++
              return makeFailingStream(
                new PromptTooLongError(`context-too-long-${streamAttempt}`, { tokenCount: 130000 }),
              )(context, signal)
            },
            signal: new AbortController().signal,
            emit: () => undefined,
          }),
        ).rejects.toBeInstanceOf(PromptTooLongError)

        expect(streamAttempt).toBe(2)
        expect(reactiveCompactions).toBe(1)
      })
    })
  })

  describe('#given a tool emits progress updates', () => {
    describe('#when workLoop executes the tool through the stream executor', () => {
      it('#then emits tool_execution_event progress updates', async () => {
        const events: AgentEvent[] = []
        const progressTool: AgentTool = {
          name: 'progress',
          description: 'progress tool',
          parameters: createSchema<Record<string, unknown>>(),
          async execute(ctx) {
            ctx.onUpdate?.('working')
            return { content: [{ type: 'text' as const, text: 'done' }] }
          },
        }

        await workLoop({
          ...createRuntime(),
          messages: [makeUserMessage('start')],
          toolExecutor: createToolExecutor([progressTool]),
          stream: makeStream([
            makeAssistantMessage([makeToolCall('progress', 'tc_progress')], 'tool_use'),
            makeAssistantMessage([{ type: 'text', text: 'finished' }], 'end_turn'),
          ]),
          signal: new AbortController().signal,
          emit: (event) => events.push(event),
        })

        expect(
          events.some(
            (event) =>
              event.type === 'tool_execution_event' &&
              event.event.type === 'progress' &&
              event.event.update === 'working',
          ),
        ).toBe(true)
      })
    })
  })

  describe('#given signal already aborted', () => {
    describe('#when workLoop starts', () => {
      it('#then throws AbortError before first turn', async () => {
        const ac = new AbortController()
        ac.abort()

        await expect(
          workLoop({
            ...createRuntime(),
            messages: [makeUserMessage('start')],
            toolExecutor: createToolExecutor([]),
            stream: makeStream([makeAssistantMessage([{ type: 'text', text: 'n/a' }], 'end_turn')]),
            signal: ac.signal,
            emit: () => undefined,
          }),
        ).rejects.toBeInstanceOf(AbortError)
      })
    })
  })

  describe('#given initial status is completed', () => {
    describe('#when loop transitions to streaming', () => {
      it('#then emits statuschange from completed to streaming', async () => {
        const events: AgentEvent[] = []

        await workLoop({
          ...createRuntime(),
          messages: [makeUserMessage('start')],
          toolExecutor: createToolExecutor([]),
          stream: makeStream([makeAssistantMessage([{ type: 'text', text: 'ok' }], 'end_turn')]),
          signal: new AbortController().signal,
          initialStatus: 'completed',
          emit: (event) => events.push(event),
        })

        expect(events.some((event) => event.type === 'status_change' && event.from === 'completed' && event.to === 'streaming')).toBe(true)
      })
    })
  })
})
