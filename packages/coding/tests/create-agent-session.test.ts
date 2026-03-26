import { describe, expect, it } from 'vitest'
import { Agent, type AgentMessage } from '@vitamin/agent'
import { createEventStream, type AssistantMessage, type Model, type StreamContext, type StreamEvent, type ToolCall } from '@vitamin/ai'
import { createHookRegistry } from '@vitamin/hooks'
import { createInMemorySessionStore } from '@vitamin/session'

import { AgentSession } from '../src/agent-session'
import { createAgentSession } from '../src/create-agent-session'

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

// ═══ createAgentSession ═══

describe('createAgentSession', () => {
  it('creates a working AgentSession with minimal options', () => {
    const session = createAgentSession({
      model: makeModel(),
      systemPrompt: 'You are helpful.',
    })

    expect(session).toBeInstanceOf(AgentSession)
    expect(session.id).toBeDefined()
    expect(session.status).toBe('idle')
  })

  it('uses provided session ID', () => {
    const session = createAgentSession({
      model: makeModel(),
      id: 'custom-id-123',
    })

    expect(session.id).toBe('custom-id-123')
  })

  it('accepts custom hooks', () => {
    const hooks = createHookRegistry({ preset: 'none' })
    const session = createAgentSession({
      model: makeModel(),
      hooks,
    })

    expect(session).toBeInstanceOf(AgentSession)
  })

  it('accepts custom sessionStore', () => {
    const store = createInMemorySessionStore<AgentMessage>()
    const session = createAgentSession({
      model: makeModel(),
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
    const sessionData = store.createSession('e2e-test')
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
})
