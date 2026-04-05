import { describe, expect, it } from 'vitest'
import { Agent, type AgentMessage } from '@vitamin/agent'
import { createEventStream, createProviderRegistry, type AssistantMessage, type Model, type ProviderStream, type StreamContext, type StreamEvent, type ToolCall } from '@vitamin/ai'
import { createHookRegistry } from '@vitamin/hooks'
import { attachLogListener, createLogger } from '@vitamin/shared'
import { createInMemorySessionStore } from '@vitamin/session'
import type { Devtools } from '@vitamin/devtools'

import { AgentSession } from '../src/session/agent-session'
import { createAgentSession } from '../src/session/create-agent-session'

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

function makeStream(response?: AssistantMessage) {
  const finalResponse = response ?? makeAssistantMessage([{ type: 'text', text: 'hello' }], 'end_turn')
  return (_context: StreamContext, _signal: AbortSignal) => {
    const eventStream = createEventStream<StreamEvent, AssistantMessage>()
    setTimeout(() => {
      eventStream.push({ type: 'start', partial: finalResponse })
      eventStream.complete(finalResponse)
    }, 0)
    return eventStream
  }
}

function makeToolStream() {
  return (context: StreamContext, _signal: AbortSignal) => {
    const eventStream = createEventStream<StreamEvent, AssistantMessage>()
    setTimeout(() => {
      const hasToolResult = context.messages.some((m) =>
        typeof m === 'object' && m !== null && 'role' in m && m.role === 'tool_result'
      )
      const response = hasToolResult
        ? makeAssistantMessage([{ type: 'text', text: 'done' }], 'end_turn')
        : makeAssistantMessage([makeToolCall('echo', 'tc_echo', { value: 'test' })], 'tool_use')
      eventStream.push({ type: 'start', partial: response })
      eventStream.complete(response)
    }, 0)
    return eventStream
  }
}

function createLogCollector(entries: string[]) {
  const name = `create-agent-session-test-${crypto.randomUUID()}`
  const detach = attachLogListener((log) => {
    const entry = log as { name?: string; msg?: string }
    if (entry.name === name && entry.msg) {
      entries.push(entry.msg)
    }
  })

  return {
    logger: createLogger(name, {
      level: 'debug',
      destination: '/tmp/vitamin-coding-test.log',
    }),
    detach,
  }
}

function makeProviderRegistry() {
  const registry = createProviderRegistry()
  registry.register('openai-completions', (): ProviderStream => ({
    id: 'test-openai',
    displayName: 'Test OpenAI',
    async *converse() {
      // no-op — tests use Agent with custom stream, not provider
    },
  }))
  return registry
}

async function flushLogs(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20))
}

// ═══ createAgentSession ═══

describe('createAgentSession', () => {
  it('creates a working AgentSession with minimal options', () => {
    const session = createAgentSession({
      model: makeModel(),
      providerRegistry: makeProviderRegistry(),
      systemPrompt: 'You are helpful.',
    })

    expect(session).toBeInstanceOf(AgentSession)
    expect(session.id).toBeDefined()
    expect(session.status).toBe('idle')
  })

  it('uses provided session ID', () => {
    const session = createAgentSession({
      model: makeModel(),
      providerRegistry: makeProviderRegistry(),
      id: 'custom-id-123',
    })

    expect(session.id).toBe('custom-id-123')
  })

  it('accepts custom hooks', () => {
    const hooks = createHookRegistry({ preset: 'none' })
    const session = createAgentSession({
      model: makeModel(),
      providerRegistry: makeProviderRegistry(),
      hooks,
    })

    expect(session).toBeInstanceOf(AgentSession)
  })

  it('accepts custom sessionStore', () => {
    const store = createInMemorySessionStore<AgentMessage>()
    const session = createAgentSession({
      model: makeModel(),
      providerRegistry: makeProviderRegistry(),
      sessionStore: store,
      id: 'store-test',
    })

    expect(session.id).toBe('store-test')
    // The session exists in the provided store
    expect(store.getSession('store-test')).toBeDefined()
  })

  it('runs prompt end-to-end without VitaminApp', async () => {
    const hooks = createHookRegistry({ preset: 'none' })
    const store = createInMemorySessionStore<AgentMessage>()
    const sessionData = await store.createSession('e2e-test')
    const agent = new Agent({ stream: makeStream() })

    const agentSession = new AgentSession(sessionData, agent, {
      model: makeModel(),
      systemPrompt: 'system',
      hooks,
    })

    await agentSession.prompt('hello world')

    const messages = sessionData.messages()
    expect(messages.length).toBeGreaterThanOrEqual(2)
    expect(messages[0]).toMatchObject({ role: 'user' })
  })

  it('emits user-facing prompt, tool, and usage logs', async () => {
    const entries: string[] = []
    const collector = createLogCollector(entries)
    const hooks = createHookRegistry({ preset: 'none' })
    const store = createInMemorySessionStore<AgentMessage>()
    const sessionData = await store.createSession('log-e2e')
    const agent = new Agent({ stream: makeToolStream() })

    const tool = {
      name: 'echo',
      description: 'echo tool',
      parameters: createSchema<Record<string, unknown>>() as never,
      async execute() {
        return {
          content: [{ type: 'text' as const, text: 'echo-result' }],
        }
      },
    }

    const agentSession = new AgentSession(sessionData, agent, {
      model: makeModel(),
      systemPrompt: 'system',
      hooks,
      tools: [tool],
      logger: collector.logger,
    })

    await agentSession.prompt('hello world')
    await flushLogs()
    collector.detach()

    expect(entries.some((entry) => entry.includes('prompt started'))).toBe(true)
    expect(entries.some((entry) => entry.includes('Executing tool'))).toBe(true)
    expect(entries.some((entry) => entry.includes('usage input='))).toBe(true)
  })

  it('applies debug payload updates before agent stream execution', async () => {
    const hooks = createHookRegistry({ preset: 'none' })
    const store = createInMemorySessionStore<AgentMessage>()
    const sessionData = await store.createSession('debug-payload-e2e')

    const streamContexts: StreamContext[] = []
    const agent = new Agent({
      stream: (context, signal) => {
        streamContexts.push(context)
        return makeStream()(context, signal)
      },
    })

    const devtools = {
      debugger: {
        pause(snapshot: { point: string }) {
          if (snapshot.point === 'prompt_before') {
            return {
              command: { type: 'continue' as const, seq: 1 },
              payload: {
                systemPrompt: 'debug prompt override',
                llmParams: {
                  temperature: 0.2,
                  maxTokens: 256,
                  thinkingLevel: 'low',
                },
              },
            }
          }

          if (snapshot.point === 'context_build') {
            return {
              command: { type: 'continue' as const, seq: 2 },
              payload: {
                injectMessages: [
                  { role: 'system' as const, content: 'debug injected context' },
                ],
              },
            }
          }

          return {
            command: { type: 'continue' as const, seq: 3 },
            payload: null,
          }
        },
      },
    } as unknown as Devtools

    const agentSession = new AgentSession(sessionData, agent, {
      model: makeModel(),
      systemPrompt: 'system',
      hooks,
      devtools,
    })

    await agentSession.prompt('hello world')

    expect(streamContexts).toHaveLength(1)
    expect(streamContexts[0]?.systemPrompt).toBe('debug prompt override')
    expect(streamContexts[0]?.temperature).toBe(0.2)
    expect(streamContexts[0]?.maxTokens).toBe(256)
    expect(streamContexts[0]?.thinkingLevel).toBe('low')
    expect(
      streamContexts[0]?.messages.some(
        (message) => message.role === 'system' && message.content === 'debug injected context',
      ),
    ).toBe(true)
  })
})
