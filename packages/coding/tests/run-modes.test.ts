import { describe, expect, it } from 'vitest'
import { Agent, type AgentMessage } from '@vitamin/agent'
import { createEventStream, type AssistantMessage, type Model, type StreamContext, type StreamEvent } from '@vitamin/ai'
import { createHookRegistry } from '@vitamin/hooks'
import { createInMemorySessionStore } from '@vitamin/session'

import { AgentSession } from '../src/session/agent-session'
import {
  InteractiveMode,
  getLastAssistantText,
  runJsonMode,
  runPrintMode,
  runRpcMode,
} from '../src/modes/run-modes'

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

function makeAssistantMessage(text: string): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'openai-completions',
    provider: 'openai',
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    stopReason: 'end_turn',
    model: 'openai/test-model',
  }
}

function makeEchoStream() {
  return (context: StreamContext, _signal: AbortSignal) => {
    const eventStream = createEventStream<StreamEvent, AssistantMessage>()
    const userText = context.messages
      .filter((m) => typeof m === 'object' && m !== null && 'role' in m && m.role === 'user')
      .flatMap((m) => ('content' in m && Array.isArray(m.content) ? m.content : []))
      .filter((part) => typeof part === 'object' && part !== null && 'type' in part && part.type === 'text')
      .map((part) => ('text' in part ? String(part.text) : ''))
      .join(' ')
      .trim()

    const response = makeAssistantMessage(`echo:${userText}`)

    setTimeout(() => {
      eventStream.push({ type: 'start', partial: response })
      eventStream.push({ type: 'done', reason: 'end_turn', message: response })
      eventStream.complete(response)
    }, 0)

    return eventStream
  }
}

function createSession(id: string): AgentSession {
  const hooks = createHookRegistry({ preset: 'none' })
  const store = createInMemorySessionStore<AgentMessage>()
  const sessionData = store.createSession(id)
  const agent = new Agent({ stream: makeEchoStream() })

  return new AgentSession(sessionData, agent, {
    model: makeModel(),
    systemPrompt: 'system',
    hooks,
  })
}

describe('run modes', () => {
  it('runPrintMode writes and returns the final assistant text', async () => {
    const session = createSession('print-mode')
    const output: string[] = []

    const text = await runPrintMode(session, 'hello print', (line) => output.push(line))

    expect(text).toContain('echo:hello print')
    expect(output).toEqual([text])
  })

  it('runJsonMode returns normalized session result', async () => {
    const session = createSession('json-mode')

    const result = await runJsonMode(session, 'hello json')

    expect(result.sessionId).toBe('json-mode')
    expect(result.status).toBeTypeOf('string')
    expect(result.messageCount).toBeGreaterThanOrEqual(2)
    expect(result.response).toContain('echo:hello json')
  })

  it('runRpcMode handles prompt and status methods', async () => {
    const session = createSession('rpc-mode')

    const promptResult = await runRpcMode(session, {
      id: '1',
      method: 'prompt',
      params: { text: 'hello rpc' },
    })

    expect(promptResult.ok).toBe(true)
    if (promptResult.ok) {
      expect(promptResult.result).toMatchObject({
        sessionId: 'rpc-mode',
      })
    }

    const statusResult = await runRpcMode(session, { id: '2', method: 'status' })
    expect(statusResult).toMatchObject({
      id: '2',
      ok: true,
    })
  })

  it('InteractiveMode handles slash commands and prompt text', async () => {
    const session = createSession('interactive-mode')
    const mode = new InteractiveMode(session)

    const help = await mode.handleInput('/help')
    expect(help).toMatchObject({ type: 'system' })

    const response = await mode.handleInput('hello interactive')
    expect(response).toMatchObject({ type: 'response' })
    if (response.type === 'response') {
      expect(response.text).toContain('echo:hello interactive')
    }

    const exit = await mode.handleInput('/exit')
    expect(exit).toEqual({ type: 'exit' })
  })

  it('getLastAssistantText returns empty string when no assistant text exists', () => {
    const text = getLastAssistantText([
      { role: 'user', timestamp: Date.now(), content: [{ type: 'text', text: 'only user' }] },
    ])

    expect(text).toBe('')
  })
})
