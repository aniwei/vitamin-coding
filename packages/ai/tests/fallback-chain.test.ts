import { ProviderError } from '@vitamin/shared'
import { describe, expect, it } from 'vitest'

import { createProviderRegistry } from '../src/providers/registry'
import {
  DEFAULT_FALLBACK_CONFIG,
  streamWithFallback,
  type FallbackChainConfig,
} from '../src/fallback-chain'

import type { AssistantMessage, Model, StreamContext, StreamEvent } from '../src/types'
import type { ProviderAdapter } from '../src/providers/types'

function makeModel(id: string, api: Model['api'] = 'ollama'): Model {
  return {
    id,
    name: id,
    api,
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxOutputTokens: 2048,
  }
}

function makeContext(): StreamContext {
  return {
    systemPrompt: 'you are helpful',
    messages: [{ role: 'user', content: 'hello', timestamp: Date.now() }],
  }
}

function makeAssistantMessage(text = 'ok'): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    stopReason: 'end_turn',
    model: 'ollama/local',
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  }
}

function makeSuccessProvider(messageText = 'ok'): ProviderAdapter {
  return {
    id: 'ollama',
    displayName: 'Mock Success',
    async *stream(): AsyncIterable<StreamEvent> {
      const message = makeAssistantMessage(messageText)
      yield { type: 'start', partial: message }
      yield { type: 'done', message }
    },
  }
}

describe('fallback-chain', () => {
  describe('#given transient server errors', () => {
    describe('#when retries are enabled', () => {
      it('#then retries and eventually succeeds', async () => {
        const registry = createProviderRegistry()
        const attempts = { count: 0 }

        registry.register('ollama', () => ({
          id: 'ollama',
          displayName: 'Flaky Provider',
          async *stream(): AsyncIterable<StreamEvent> {
            attempts.count += 1
            if (attempts.count < 3) {
              throw new ProviderError('busy', { code: 'PROVIDER_SERVER_ERROR' })
            }
            const message = makeAssistantMessage('recovered')
            yield { type: 'done', message }
          },
        }))

        const stream = streamWithFallback(
          [makeModel('ollama/local')],
          makeContext(),
          { ...DEFAULT_FALLBACK_CONFIG, maxRetries: 3 },
          registry,
        )

        const result = await stream.result()

        expect(result.content[0]).toEqual({ type: 'text', text: 'recovered' })
        expect(attempts.count).toBe(3)
      })
    })
  })

  describe('#given retry backoff config', () => {
    describe('#when retryable errors happen repeatedly', () => {
      it('#then applies exponential delays', async () => {
        const registry = createProviderRegistry()
        const delays: number[] = []

        // 注入可观测的 sleep 函数，替代 vi.spyOn
        const sleepFn = async (ms: number): Promise<void> => {
          delays.push(ms)
        }

        registry.register('ollama', () => ({
          id: 'ollama',
          displayName: 'Always Fails',
          async *stream(): AsyncIterable<StreamEvent> {
            throw new ProviderError('timeout', { code: 'PROVIDER_TIMEOUT' })
          },
        }))

        const config: FallbackChainConfig = {
          ...DEFAULT_FALLBACK_CONFIG,
          maxRetries: 3,
          crossProviderFallback: false,
          backoff: { initial: 100, multiplier: 2, max: 10_000 },
        }

        const stream = streamWithFallback(
          [makeModel('ollama/local')],
          makeContext(),
          config,
          registry,
          undefined,
          undefined,
          sleepFn,
        )

        await expect(stream.result()).rejects.toThrow('All providers exhausted')
        expect(delays).toEqual([100, 200, 400])
      })
    })
  })

  describe('#given rate limit on first model', () => {
    describe('#when cross-provider fallback is enabled', () => {
      it('#then emits fallback event and switches to next model', async () => {
        const registry = createProviderRegistry()
        const events: Array<{ type: string; from?: string; to?: string }> = []

        registry.register('ollama', () => ({
          id: 'ollama',
          displayName: 'Rate Limited',
          async *stream(): AsyncIterable<StreamEvent> {
            throw new ProviderError('rate limited', { code: 'PROVIDER_RATE_LIMIT' })
          },
        }))

        registry.register('openai-completions', () =>
          makeSuccessProvider('fallback-success'),
        )

        const models: Model[] = [
          makeModel('ollama/local', 'ollama'),
          makeModel('openai/compatible', 'openai-completions'),
        ]

        const stream = streamWithFallback(models, makeContext(), DEFAULT_FALLBACK_CONFIG, registry)

        const consume = (async () => {
          for await (const event of stream) {
            if (event.type === 'fallback') {
              events.push({ type: event.type, from: event.from, to: event.to })
            }
          }
        })()

        const result = await stream.result()
        await consume

        expect(result.content[0]).toEqual({ type: 'text', text: 'fallback-success' })
        expect(events).toContainEqual({
          type: 'fallback',
          from: 'ollama/local',
          to: 'openai/compatible',
        })
      })
    })
  })

  describe('#given context overflow error', () => {
    describe('#when first model fails', () => {
      it('#then fails fast without retry', async () => {
        const registry = createProviderRegistry()
        const attempts = { count: 0 }

        registry.register('ollama', () => ({
          id: 'ollama',
          displayName: 'Context Overflow',
          async *stream(): AsyncIterable<StreamEvent> {
            attempts.count += 1
            throw new ProviderError('too long', { code: 'PROVIDER_CONTEXT_OVERFLOW' })
          },
        }))

        const stream = streamWithFallback(
          [makeModel('ollama/local')],
          makeContext(),
          DEFAULT_FALLBACK_CONFIG,
          registry,
        )

        await expect(stream.result()).rejects.toThrow('too long')
        expect(attempts.count).toBe(1)
      })
    })
  })
})
