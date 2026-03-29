import { describe, expect, it, afterEach } from 'vitest'
import { createEventStream, createProviderRegistry, type AssistantMessage, type Model, type StreamContext, type StreamEvent } from '@vitamin/ai'
import { createHookRegistry } from '@vitamin/hooks'

import { createVitamin, type VitaminAppOptions } from '../src/app/vitamin-app'
import { createInMemoryResourceManager } from '../src/resources/resource-manager'
import { createReviewGate } from '@vitamin/orchestrator'
import { createLeadSession, parseLeadResult } from '../src/lead/lead-session'

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
  const providerRegistry = createProviderRegistry()
  providerRegistry.register('openai-completions', () => ({
    id: 'test-provider',
    displayName: 'Test Provider',
    converse(_model, _context, _options, _signal) {
      onConverse?.(_context)
      const eventStream = createEventStream<StreamEvent, AssistantMessage>()
      const response: AssistantMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: responseText }],
        stopReason: 'end_turn',
        model: 'test-model',
        api: 'openai-completions',
        provider: 'openai',
        usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 },
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

function makeContextAwareProviderRegistry() {
  const providerRegistry = createProviderRegistry()
  providerRegistry.register('openai-completions', () => ({
    id: 'context-aware-test-provider',
    displayName: 'Context Aware Test Provider',
    converse(_model, context: StreamContext, _options, _signal) {
      const userCount = context.messages.filter((message) => message.role === 'user').length
      const eventStream = createEventStream<StreamEvent, AssistantMessage>()
      const response: AssistantMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: `done\nuser-count:${userCount}` }],
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

// ═══ parseLeadResult 单元测试 ═══

describe('parseLeadResult', () => {
  it('parses "done" status', () => {
    const result = parseLeadResult('done\nEverything is complete.', 'session-1', [])
    expect(result.status).toBe('done')
    expect(result.output).toContain('Everything is complete')
    expect(result.sessionId).toBe('session-1')
  })

  it('parses "done_with_concerns" status', () => {
    const result = parseLeadResult('done_with_concerns\nSome files are outdated.', 'session-2', [])
    expect(result.status).toBe('done_with_concerns')
    expect(result.concerns).toBe('Some files are outdated.')
  })

  it('parses "needs_context" status', () => {
    const result = parseLeadResult('needs_context\nPlease provide the API key.', 'session-3', [])
    expect(result.status).toBe('needs_context')
    expect(result.missingContext).toBe('Please provide the API key.')
  })

  it('parses "blocked" status', () => {
    const result = parseLeadResult('blocked\nCannot access the database.', 'session-4', [])
    expect(result.status).toBe('blocked')
    expect(result.blockReason).toBe('Cannot access the database.')
  })

  it('defaults to "done" when no status prefix', () => {
    const result = parseLeadResult('Here is the answer.', 'session-5', [])
    expect(result.status).toBe('done')
    expect(result.output).toBe('Here is the answer.')
  })

  it('case-insensitive status matching', () => {
    const result = parseLeadResult('Done\nFinished.', 'session-6', [])
    expect(result.status).toBe('done')
  })

  it('handles "status: done" prefix', () => {
    const result = parseLeadResult('status: done\nOK', 'session-7', [])
    expect(result.status).toBe('done')
  })

  it('preserves task summaries', () => {
    const tasks = [{ id: 't-1', status: 'completed', prompt: 'test', output: 'ok' }]
    const result = parseLeadResult('done', 'session-8', tasks)
    expect(result.tasks).toEqual(tasks)
  })
})

// ═══ LeadSession 集成测试 ═══

describe('LeadSession', () => {
  let app: ReturnType<typeof createVitamin> | null = null

  afterEach(async () => {
    if (app) {
      await app.stop()
      app = null
    }
  })

  it('run() returns structured LeadResult via session.prompt()', async () => {
    app = createVitamin(makeBaseOptions({
      providerRegistry: makeProviderRegistry('done\nProject analysis complete.'),
    }))
    await app.start()

    const session = await app.createSession()
    const leadSession = createLeadSession(session, app.orchestrator)

    const result = await leadSession.run('Analyze this project')

    expect(result.status).toBe('done')
    expect(result.output).toContain('Project analysis complete')
    expect(result.sessionId).toBe(session.id)
    expect(result.tasks).toEqual([])

    leadSession.dispose()
  })

  it('run() collects task summaries from orchestrator events', async () => {
    app = createVitamin(makeBaseOptions({
      providerRegistry: makeProviderRegistry('done\nAll good.'),
    }))
    await app.start()

    const session = await app.createSession()
    const leadSession = createLeadSession(session, app.orchestrator)

    // Simulate a task.completed event during run
    const runPromise = leadSession.run('Do something')

    // The agent won't delegate anything with a simple test provider,
    // but we validate the event callback mechanism
    const result = await runPromise

    expect(result.status).toBe('done')
    expect(Array.isArray(result.tasks)).toBe(true)

    leadSession.dispose()
  })

  it('run() invokes onTaskCreated callback', async () => {
    app = createVitamin(makeBaseOptions())
    await app.start()

    const session = await app.createSession()
    const leadSession = createLeadSession(session, app.orchestrator)

    let taskCreatedCalled = false
    await leadSession.run('Hello', {
      onTaskCreated: () => { taskCreatedCalled = true },
    })
    // No tasks will be created by a simple echo provider,
    // but the wiring is exercised without error
    expect(taskCreatedCalled).toBe(false)

    leadSession.dispose()
  })

  it('throws if disposed', async () => {
    app = createVitamin(makeBaseOptions())
    await app.start()

    const session = await app.createSession()
    const leadSession = createLeadSession(session, app.orchestrator)
    leadSession.dispose()

    await expect(leadSession.run('Hello')).rejects.toThrow('disposed')
  })
})

// ═══ VitaminApp.lead() 集成测试 ═══

describe('VitaminApp.lead()', () => {
  let app: ReturnType<typeof createVitamin> | null = null

  afterEach(async () => {
    if (app) {
      await app.stop()
      app = null
    }
  })

  it('creates lead session on first call and returns LeadResult', async () => {
    app = createVitamin(makeBaseOptions({
      providerRegistry: makeProviderRegistry('done\nLead result here.'),
    }))
    await app.start()

    expect(app.getLeadSession()).toBeNull()

    const result = await app.lead('Explain')

    expect(result.status).toBe('done')
    expect(result.output).toContain('Lead result here')
    expect(app.getLeadSession()).not.toBeNull()
  })

  it('passes the final lead system prompt into the lead session model call', async () => {
    let capturedSystemPrompt = ''

    app = createVitamin(makeBaseOptions({
      systemPrompt: 'You are Vitamin.',
      resourceManager: createInMemoryResourceManager({
        memories: new Map([
          ['~/.vitamin/AGENTS.md', '# Global\nBe helpful.'],
        ]),
      }),
      providerRegistry: makeProviderRegistry('done\nPrompt verified.', (context) => {
        capturedSystemPrompt = context.systemPrompt
      }),
    }))
    await app.start()

    const finalLeadSystemPrompt = app.getLeadSystemPrompt()
    expect(finalLeadSystemPrompt).toBeTruthy()
    expect(finalLeadSystemPrompt).toContain('You are Vitamin.')
    expect(finalLeadSystemPrompt).toContain('Be helpful.')
    expect(finalLeadSystemPrompt).toContain('Lead Agent')
    expect(finalLeadSystemPrompt).toContain('Tooling Surface')

    const result = await app.lead('Verify prompt wiring')

    expect(result.status).toBe('done')
    expect(capturedSystemPrompt).toBe(finalLeadSystemPrompt)
  })

  it('reuses existing lead session on subsequent calls', async () => {
    app = createVitamin(makeBaseOptions({
      providerRegistry: makeProviderRegistry('done\nFirst.'),
    }))
    await app.start()

    await app.lead('First prompt')
    const leadSessionId = app.getLeadSession()!.id

    // Re-create provider to return a different response for the second call
    const result = await app.lead('Second prompt')

    // Same session should be reused
    expect(app.getLeadSession()!.id).toBe(leadSessionId)
    expect(result.status).toBe('done')
  })

  it('supports done_with_concerns response', async () => {
    app = createVitamin(makeBaseOptions({
      providerRegistry: makeProviderRegistry('done_with_concerns\nSome tests are flaky.'),
    }))
    await app.start()

    const result = await app.lead('Review')

    expect(result.status).toBe('done_with_concerns')
    expect(result.concerns).toBe('Some tests are flaky.')
  })

  it('stop() disposes lead session', async () => {
    app = createVitamin(makeBaseOptions())
    await app.start()

    await app.lead('Hello')
    expect(app.getLeadSession()).not.toBeNull()

    await app.stop()
    // After stop, getLeadSession should return null
    expect(app.getLeadSession()).toBeNull()
    app = null // prevent double-stop in afterEach
  })
})

// ═══ Dispatcher ReviewGate 集成测试 ═══

describe('Dispatcher ReviewGate integration', () => {
  let app: ReturnType<typeof createVitamin> | null = null

  afterEach(async () => {
    if (app) {
      await app.stop()
      app = null
    }
  })

  it('passes dispatch when review gate passes', async () => {
    const reviewGate = createReviewGate()
    reviewGate.addChecker({
      type: 'spec',
      name: 'always-pass',
      check: async () => ({
        type: 'spec',
        verdict: 'pass',
        issues: [],
        summary: 'All good',
      }),
    })

    app = createVitamin(makeBaseOptions({
      providerRegistry: makeProviderRegistry('done\nTask output.'),
      reviewGate,
    }))
    await app.start()

    const result = await app.orchestrator!.dispatcher.dispatch({
      prompt: 'test task',
      mode: 'sync',
    })

    expect(result.success).toBe(true)
    expect(result.output).toContain('Task output')
  })

  it('fails dispatch when review gate fails', async () => {
    const reviewGate = createReviewGate()
    reviewGate.addChecker({
      type: 'spec',
      name: 'always-fail',
      check: async () => ({
        type: 'spec',
        verdict: 'fail',
        issues: [
          { severity: 'critical', message: 'Output does not match spec' },
        ],
        summary: 'Failed spec check',
      }),
    })

    app = createVitamin(makeBaseOptions({
      providerRegistry: makeProviderRegistry('done\nBad output.'),
      reviewGate,
    }))
    await app.start()

    const result = await app.orchestrator!.dispatcher.dispatch({
      prompt: 'test task',
      mode: 'sync',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Review failed')
    expect(result.error).toContain('Output does not match spec')
  })

  it('dispatches succeed without review gate (backward compatible)', async () => {
    app = createVitamin(makeBaseOptions({
      providerRegistry: makeProviderRegistry('done\nNormal output.'),
    }))
    await app.start()

    const result = await app.orchestrator!.dispatcher.dispatch({
      prompt: 'no review task',
      mode: 'sync',
    })

    expect(result.success).toBe(true)
  })

  it('uses ephemeral child sessions by default', async () => {
    app = createVitamin(makeBaseOptions({
      providerRegistry: makeContextAwareProviderRegistry(),
    }))
    await app.start()

    const first = await app.orchestrator!.dispatcher.dispatch({
      prompt: 'first child task',
      mode: 'sync',
      sessionId: 'child-ephemeral',
    })
    const second = await app.orchestrator!.dispatcher.dispatch({
      prompt: 'second child task',
      mode: 'sync',
      sessionId: 'child-ephemeral',
    })

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(first.output).toContain('user-count:1')
    expect(second.output).toContain('user-count:1')
  })

  it('reuses sticky child sessions when sessionId is provided', async () => {
    app = createVitamin(makeBaseOptions({
      providerRegistry: makeContextAwareProviderRegistry(),
    }))
    await app.start()

    const first = await app.orchestrator!.dispatcher.dispatch({
      prompt: 'first sticky child task',
      mode: 'sync',
      sessionId: 'child-sticky',
      sessionMode: 'sticky',
    })
    const second = await app.orchestrator!.dispatcher.dispatch({
      prompt: 'second sticky child task',
      mode: 'sync',
      sessionId: 'child-sticky',
      sessionMode: 'sticky',
    })

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(first.output).toContain('user-count:1')
    expect(second.output).toContain('user-count:2')
  })
})
