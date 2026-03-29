import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultProviderRegistry, createEventStream, type AssistantMessage, type Model, type StreamContext, type StreamEvent } from '@vitamin/ai'
import { createHookRegistry } from '@vitamin/hooks'
import { LeadInteractiveMode, runLeadJsonMode, runLeadPrintMode } from '@vitamin/coding'

import { createVitamin, type VitaminAppOptions } from '../../coding/src/app/vitamin-app'
import { createInMemoryResourceManager } from '../../coding/src/resources/resource-manager'
import { parseCLI } from '../src/cli'

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

function makeProviderRegistry(
  responseText = 'done\nAll tasks completed.',
  onConverse?: (context: StreamContext) => void,
) {
  const providerRegistry = createDefaultProviderRegistry()
  providerRegistry.register('openai-completions', () => ({
    id: 'test-provider',
    displayName: 'Test Provider',
    converse(_model, context, _options, _signal) {
      onConverse?.(context)
      const eventStream = createEventStream<StreamEvent, AssistantMessage>()
      const response: AssistantMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: responseText }],
        stopReason: 'end_turn',
        model: 'test-model',
        api: 'openai-completions',
        provider: 'openai',
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      }
      setTimeout(() => {
        eventStream.push({ type: 'start', partial: response })
        eventStream.push({ type: 'done', reason: 'end_turn', message: response })
        eventStream.complete(response)
      }, 0)
      return eventStream
    },
  }))
  return providerRegistry
}

function makeBaseOptions(overrides: Partial<VitaminAppOptions> = {}): VitaminAppOptions {
  return {
    port: 0,
    inspect: false,
    logger: { name: 'test', level: 'error', destination: 'stdout' },
    model: makeModel(),
    providerRegistry: makeProviderRegistry(),
    hooks: createHookRegistry({ preset: 'none' }),
    resourceManager: createInMemoryResourceManager(),
    ...overrides,
  }
}

describe('CLI lead modes', () => {
  let app: ReturnType<typeof createVitamin> | null = null

  afterEach(async () => {
    if (app) {
      await app.stop()
      app = null
    }
  })

  it('runLeadPrintMode uses vitamin.lead() output', async () => {
    const writes: string[] = []
    app = createVitamin(makeBaseOptions({
      providerRegistry: makeProviderRegistry('done\nLead output.'),
    }))
    await app.start()

    const result = await runLeadPrintMode(app, 'Explain', (text) => writes.push(text))

    expect(result.status).toBe('done')
    expect(result.output).toBe('done\nLead output.')
    expect(writes).toEqual(['done\nLead output.'])
  })

  it('runLeadJsonMode returns structured LeadResult', async () => {
    app = createVitamin(makeBaseOptions({
      providerRegistry: makeProviderRegistry('done_with_concerns\nTests need rerun.'),
    }))
    await app.start()

    const result = await runLeadJsonMode(app, 'Review this change')

    expect(result.status).toBe('done_with_concerns')
    expect(result.concerns).toBe('Tests need rerun.')
    expect(result.sessionId).toBeTruthy()
  })

  it('LeadInteractiveMode reuses the same lead session across prompts', async () => {
    app = createVitamin(makeBaseOptions({
      providerRegistry: makeProviderRegistry('done\nInteractive result.'),
    }))
    await app.start()

    const interactive = new LeadInteractiveMode(app)

    const first = await interactive.handleInput('First prompt')
    const firstSessionId = app.getLeadSession()?.id
    const second = await interactive.handleInput('Second prompt')
    const secondSessionId = app.getLeadSession()?.id

    expect(first.type).toBe('response')
    expect(second.type).toBe('response')
    expect(firstSessionId).toBeTruthy()
    expect(secondSessionId).toBe(firstSessionId)
  })

  it('LeadInteractiveMode reports missing lead session for compact before first prompt', async () => {
    app = createVitamin(makeBaseOptions())
    await app.start()

    const interactive = new LeadInteractiveMode(app)
    const result = await interactive.handleInput('/compact 1 summary')

    expect(result).toEqual({ type: 'system', text: 'No active lead session.' })
  })
})

describe('parseCLI', () => {
  it('defaults to interactive mode when no prompt is provided', () => {
    const parsed = parseCLI(['node', 'vitamin'])

    expect(parsed.options.mode).toBe('interactive')
    expect(parsed.options.prompt).toBeUndefined()
  })

  it('supports explicit print mode flag', () => {
    const parsed = parseCLI(['node', 'vitamin', '--print', 'hello'])

    expect(parsed.options.mode).toBe('print')
    expect(parsed.options.prompt).toBe('hello')
  })
})