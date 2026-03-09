import { describe, expect, it } from 'vitest'

import { createProviderRegistry } from '../src/providers/registry'
import { stream, complete } from '../src/stream'

import type { AssistantMessage, Model, StreamContext, StreamEvent } from '../src/types'

function makeModel(api: Model['api'] = 'openai-completions'): Model {
  return {
    id: `openai/gpt-test-${api}`,
    name: 'test-model',
    api,
    provider: api === 'ollama' ? 'ollama' : 'openai',
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
    content: [{ type: 'text', text }],
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    stopReason: 'end_turn',
    model: 'openai/gpt-test',
  }
}

describe('stream orchestrator', () => {
  describe('#given provider returns done event', () => {
    describe('#when complete is called', () => {
      it('#then resolves final assistant message', async () => {
        const registry = createProviderRegistry()

        registry.register('openai-completions', () => ({
          id: 'openai-completions',
          displayName: 'Mock OpenAI',
          async *stream(): AsyncIterable<StreamEvent> {
            const message = makeAssistantMessage('hello back')
            yield { type: 'start', partial: message }
            yield { type: 'text_delta', index: 0, delta: 'hello back' }
            yield { type: 'done', message }
          },
        }))

        const result = await complete(makeModel('openai-completions'), makeContext(), {
          providerRegistry: registry,
          apiKey: 'explicit-key',
        })

        expect(result.content[0]).toEqual({ type: 'text', text: 'hello back' })
      })
    })
  })

  describe('#given provider emits error event', () => {
    describe('#when stream result is awaited', () => {
      it('#then rejects with provider error', async () => {
        const registry = createProviderRegistry()

        registry.register('openai-completions', () => ({
          id: 'openai-completions',
          displayName: 'Mock OpenAI',
          async *stream(): AsyncIterable<StreamEvent> {
            yield { type: 'error', error: new Error('provider failed') }
          },
        }))

        const eventStream = stream(makeModel('openai-completions'), makeContext(), {
          providerRegistry: registry,
          apiKey: 'explicit-key',
        })

        await expect(eventStream.result()).rejects.toThrow('provider failed')
      })
    })
  })

  describe('#given provider ends without done event', () => {
    describe('#when complete is called', () => {
      it('#then rejects with incomplete stream error', async () => {
        const registry = createProviderRegistry()

        registry.register('openai-completions', () => ({
          id: 'openai-completions',
          displayName: 'Mock OpenAI',
          async *stream(): AsyncIterable<StreamEvent> {
            const message = makeAssistantMessage('partial')
            yield { type: 'start', partial: message }
          },
        }))

        await expect(
          complete(makeModel('openai-completions'), makeContext(), {
            providerRegistry: registry,
            apiKey: 'explicit-key',
          }),
        ).rejects.toThrow('Stream ended without done event')
      })
    })
  })

  describe('#given explicit api key option', () => {
    describe('#when provider receives stream options', () => {
      it('#then forwards explicit key to provider adapter', async () => {
        const registry = createProviderRegistry()
        let capturedKey: string | undefined

        registry.register('openai-completions', () => ({
          id: 'openai-completions',
          displayName: 'Mock OpenAI',
          async *stream(_model, _context, options): AsyncIterable<StreamEvent> {
            capturedKey = options.apiKey
            yield { type: 'done', message: makeAssistantMessage('ok') }
          },
        }))

        await complete(makeModel('openai-completions'), makeContext(), {
          providerRegistry: registry,
          apiKey: 'explicit-key',
        })

        expect(capturedKey).toBe('explicit-key')
      })
    })
  })
})
