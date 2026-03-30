import { describe, expect, it, afterEach } from 'vitest'
import { createEventStream, createProviderRegistry, type AssistantMessage, type Model, type StreamEvent } from '@vitamin/ai'
import { createHookRegistry } from '@vitamin/hooks'

import { createVitamin, type VitaminAppOptions } from '../src/app/vitamin-app'
import { createInMemoryResourceManager } from '../src/resources/resource-manager'
import { createReviewGate } from '../../orchestrator/src'

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

function makeProviderRegistry() {
  const providerRegistry = createProviderRegistry()
  providerRegistry.register('openai-completions', () => ({
    id: 'test-provider',
    displayName: 'Test Provider',
    converse(_model, _context, _options, _signal) {
      const eventStream = createEventStream<StreamEvent, AssistantMessage>()
      const response: AssistantMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
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
    ...overrides,
  }
}

describe('Lead Agent wiring', () => {
  let app: ReturnType<typeof createVitamin> | null = null

  afterEach(async () => {
    if (app) {
      await app.stop()
      app = null
    }
  })

  it('resolves modelId into the default session model and fallback agent', async () => {
    app = createVitamin({
      port: 0,
      inspect: false,
      logger: { name: 'test', level: 'error', destination: 'stdout' },
      modelId: 'github-copilot/gpt-4.1',
      hooks: createHookRegistry({ preset: 'none' }),
      resourceManager: createInMemoryResourceManager(),
    })

    await app.start()

    expect(app.modelRegistry.getDefault()?.id).toBe('github-copilot/gpt-4.1')
    expect(app.orchestrator!.agentRegistry.resolve({})?.model).toBe('github-copilot/gpt-4.1')

    const session = await app.createSession()
    expect(session.id).toBeTruthy()
  })

  it('registers fallback agent with lead system prompt after start()', async () => {
    const memories = new Map<string, string>([
      ['~/.vitamin/AGENTS.md', '# Global\nBe helpful.'],
    ])

    app = createVitamin(makeBaseOptions({
      systemPrompt: 'You are Vitamin.',
      resourceManager: createInMemoryResourceManager({ memories }),
    }))

    await app.start()

    // orchestrator 应存在且 agentRegistry 有 fallback
    const orchestrator = app.orchestrator!
    expect(orchestrator).toBeDefined()

    // fallback agent 存在
    const fallback = orchestrator.agentRegistry.resolve({})    
    expect(fallback).toBeDefined()
    expect(fallback!.name).toBe('__fallback__')

    // system prompt 包含所有组成部分
    expect(fallback!.systemPrompt).toContain('You are Vitamin.')
    expect(fallback!.systemPrompt).toContain('Be helpful.')
    // LEAD_ROLE_INSTRUCTIONS 已注入
    expect(fallback!.systemPrompt).toContain('Lead Agent')
    expect(fallback!.systemPrompt).toContain('Phase 2: Plan')
    expect(fallback!.systemPrompt).toContain('Phase 3: Execute Or Delegate')
    expect(app.toolRegistry!.getAvailable('full').length).toBeGreaterThan(0)
  })

  it('compiles config agents into AgentSpec registrations', async () => {
    app = createVitamin(makeBaseOptions({
      resourceManager: createInMemoryResourceManager(),
      configOverrides: {
        agents: {
          reviewer: { model: 'openai/gpt-4', description: 'Code reviewer agent' },
          writer: { model: 'openai/gpt-4', disabled: true },
        },
      },
    }))

    await app.start()

    const registry = app.orchestrator!.agentRegistry

    // reviewer 已注册且带 description
    const reviewer = registry.get('reviewer')
    expect(reviewer).toBeDefined()
    expect(reviewer!.model).toBe('openai/gpt-4')
    expect(reviewer!.description).toBe('Code reviewer agent')

    // writer 已 disabled，不应注册
    expect(registry.get('writer')).toBeUndefined()
  })

  it('maps extended config fields into AgentSpec', async () => {
    app = createVitamin(makeBaseOptions({
      resourceManager: createInMemoryResourceManager(),
      configOverrides: {
        agents: {
          specialist: {
            model: 'openai/gpt-4',
            system_prompt: 'You are a specialist.',
            tools: ['read_file', 'write_file'],
            capabilities: ['code', 'file'],
            max_tool_turns: 10,
          },
        },
      },
    }))

    await app.start()

    const spec = app.orchestrator!.agentRegistry.get('specialist')
    expect(spec).toBeDefined()
    expect(spec!.systemPrompt).toBe('You are a specialist.')
    expect(spec!.tools).toEqual(['read_file', 'write_file'])
    expect(spec!.capabilities).toEqual(['code', 'file'])
    expect(spec!.maxToolTurns).toBe(10)
  })

  it('respects disabled_agents list from config', async () => {
    app = createVitamin(makeBaseOptions({
      resourceManager: createInMemoryResourceManager(),
      configOverrides: {
        agents: {
          planner: { model: 'openai/gpt-4' },
        },
        disabled_agents: ['planner'],
      },
    }))

    await app.start()

    expect(app.orchestrator!.agentRegistry.get('planner')).toBeUndefined()
  })

  it('wires clarifyChannel when clarifyHandler provided', async () => {
    app = createVitamin(makeBaseOptions({
      resourceManager: createInMemoryResourceManager(),
      clarifyHandler: async () => ({ answer: 'test reply' }),
    }))

    await app.start()

    expect((app.orchestrator as any).clarifyChannel).toBeDefined()
  })

  it('user-configured lead agent is not overwritten by fallback', async () => {
    app = createVitamin(makeBaseOptions({
      resourceManager: createInMemoryResourceManager(),
      configOverrides: {
        agents: {
          lead: {
            model: 'anthropic/claude-4',
            system_prompt: 'I am the user lead.',
          },
        },
      },
    }))

    await app.start()

    const registry = app.orchestrator!.agentRegistry
    // 用户定义的 lead agent 保留
    const userLead = registry.get('lead')
    expect(userLead).toBeDefined()
    expect(userLead!.model).toBe('anthropic/claude-4')
    expect(userLead!.systemPrompt).toBe('I am the user lead.')

    // fallback 使用 '__fallback__' 名称，不与用户 lead 冲突
    const fallback = registry.resolve({})
    expect(fallback).toBeDefined()
    expect(fallback!.name).toBe('__fallback__')
  })

  it('passes reviewGate through to orchestrator bootstrap', async () => {
    const reviewGate = createReviewGate()

    app = createVitamin(makeBaseOptions({
      resourceManager: createInMemoryResourceManager(),
      reviewGate,
    }))

    await app.start()

    expect((app.orchestrator as any).reviewGate).toBe(reviewGate)
  })

  it('omits clarifyChannel when no handler', async () => {
    app = createVitamin(makeBaseOptions({
      resourceManager: createInMemoryResourceManager(),
    }))

    await app.start()

    expect((app.orchestrator as any).clarifyChannel).toBeUndefined()
  })
})
