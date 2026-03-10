import { describe, expect, it } from 'vitest'

import { complete, stream } from '../src/stream'

import type { AssistantMessage, Model, ProviderStream, StreamContext, StreamEvent } from '../src/types'

function makeModel(): Model {
  return {
    id: 'openai/test',
    name: 'test',
    api: 'openai-completions',
    provider: 'openai',
    baseUrl: 'https://example.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxOutputTokens: 4096,
  }
}

function makeContext(): StreamContext {
  return {
    systemPrompt: 'you are helpful',
    messages: [{ role: 'user', content: 'hello', timestamp: Date.now() }],
  }
}

function makeAssistantMessage(text: string): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', data: text }],
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    stopReason: 'end_turn',
    model: 'openai/test',
    api: 'openai-completions',
    provider: 'openai',
  }
}

describe('stream orchestrator', () => {
  it('complete resolves final assistant message', async () => {
    const provider: ProviderStream = {
      id: 'openai-completions',
      displayName: 'Mock OpenAI',
      async *converse(): AsyncIterable<StreamEvent> {
        const message = makeAssistantMessage('hello back')
        yield { type: 'start', partial: message }
        yield { type: 'done', reason: 'stop', message }
      },
    }

    const result = await complete(makeModel(), provider, makeContext(), {})
    expect(result.content[0]).toEqual({ type: 'text', data: 'hello back' })
  })

  it('stream result rejects when provider emits error event', async () => {
    const provider: ProviderStream = {
      id: 'openai-completions',
      displayName: 'Mock OpenAI',
      async *converse(): AsyncIterable<StreamEvent> {
        yield {
          type: 'error',
          reason: 'error',
          error: new Error('provider failed') as unknown as AssistantMessage,
        }
      },
    }

    const eventStream = stream(makeModel(), provider, makeContext(), {})
    await expect(eventStream.result()).rejects.toThrow('provider failed')
  })

  it('complete rejects when stream ends without done event', async () => {
    const provider: ProviderStream = {
      id: 'openai-completions',
      displayName: 'Mock OpenAI',
      async *converse(): AsyncIterable<StreamEvent> {
        const partial = makeAssistantMessage('partial')
        yield { type: 'start', partial }
      },
    }

    await expect(complete(makeModel(), provider, makeContext(), {})).rejects.toThrow(
      'Stream ended without done event',
    )
  })
})
