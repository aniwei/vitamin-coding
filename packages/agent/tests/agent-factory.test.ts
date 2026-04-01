import { describe, expect, it } from 'vitest'

import { Agent, createAgentWithRegistry } from '../src/index'
import { createEventStream } from '../../ai/src/index'

import type {
  AssistantMessage,
  Model,
  ProviderRegistry,
  ProviderStream,
  StreamContext,
  StreamEvent,
} from '../../ai/src/index'

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

function makeProvider(message: AssistantMessage, onUse?: () => void): ProviderStream {
  return {
    id: 'test-provider',
    displayName: 'Test Provider',
    async *converse(_model, _context, _options, _signal) {
      onUse?.()
      yield { type: 'start', partial: message }
      yield { type: 'done', reason: message.stopReason, message }
    },
  }
}

function makeProviderRegistry(provider: ProviderStream, onGet?: () => void): ProviderRegistry {
  return {
    get() {
      onGet?.()
      return provider
    },
  } as ProviderRegistry
}

describe('createAgentWithRegistry', () => {
  it('#then builds an Agent that can run through ProviderRegistry stream resolution', async () => {
    let providerUsed = false
    const response = makeAssistantMessage('from-registry')
    const agent = createAgentWithRegistry({
      model: makeModel(),
      providerRegistry: makeProviderRegistry(
        makeProvider(response, () => {
          providerUsed = true
        }),
      ),
    })

    const messages = [{ role: 'user' as const, content: 'start', timestamp: Date.now() }]
    const result = await agent.run({
      model: makeModel(),
      systemPrompt: 'test',
      tools: [],
      messages,
    })

    expect(agent).toBeInstanceOf(Agent)
    expect(providerUsed).toBe(true)
    expect(result.content[0]).toEqual({ type: 'text', text: 'from-registry' })
  })

  it('#then prefers an explicit stream over registry-derived stream creation', async () => {
    let registryRequested = false
    const agent = createAgentWithRegistry({
      model: makeModel(),
      providerRegistry: makeProviderRegistry(
        makeProvider(makeAssistantMessage('from-registry')),
        () => {
          registryRequested = true
        },
      ),
      stream: makeStream([makeAssistantMessage('from-explicit-stream')]),
    })

    const messages = [{ role: 'user' as const, content: 'start', timestamp: Date.now() }]
    const result = await agent.run({
      model: makeModel(),
      systemPrompt: 'test',
      tools: [],
      messages,
    })

    expect(registryRequested).toBe(false)
    expect(result.content[0]).toEqual({ type: 'text', text: 'from-explicit-stream' })
  })
})