import { describe, expect, it } from 'vitest'
import { Agent } from '@x-mars/agent'
import { createEventStream, type AssistantMessage, type Model, type StreamContext, type StreamEvent, type ToolCall } from '@x-mars/ai'
import { createHookRegistry } from '@x-mars/hooks'
import { appendPromptSection } from '@x-mars/prompt'
import { createInMemorySessionStore } from '@x-mars/session'
import { ToolRegistry } from '@x-mars/tools'

import { AgentSession } from '../src/session/agent-session'
import { createXMars } from '../src/app/x-mars-app'
import { createProviderRegistry } from '@x-mars/ai'
import { createToolGuidanceHook } from '../src/hooks/tool-guidance'
import { createSkillCatalogHook } from '../src/hooks/skill-catalog'
import { buildMcpContextSection } from '../src/hooks/mcp-injection'
import type { McpManager } from '@x-mars/tools'
import type { SkillProvider } from '@x-mars/skill'

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

function makeOneTurnStream() {
  return (_context: StreamContext, _signal: AbortSignal) => {
    const eventStream = createEventStream<StreamEvent, AssistantMessage>()
    const response = makeAssistantMessage([{ type: 'text', text: 'ok' }], 'end_turn')

    setTimeout(() => {
      eventStream.push({ type: 'start', partial: response })
      eventStream.complete(response)
    }, 0)

    return eventStream
  }
}

describe('coding hooks integration', () => {
  it('injects skill catalog as a prompt section without skill bodies', async () => {
    const provider: SkillProvider = {
      async load() {
        return { success: true, name: 'code-review' }
      },
      async execute() {
        return { success: true, output: 'ok' }
      },
      async catalog() {
        return '## Available Skills\n\n- **code-review**: Use when reviewing code'
      },
    }
    const hooks = createHookRegistry({ preset: 'none' })
    hooks.register(createSkillCatalogHook(provider))

    const sessionStore = createInMemorySessionStore()
    const session = await sessionStore.createSession('session-skill-catalog')
    const agent = new Agent({ stream: makeOneTurnStream() })
    const agentSession = new AgentSession(session, agent, {
      model: makeModel(),
      systemPrompt: 'base system',
      hookRegistry: hooks,
    })

    await agentSession.prompt('hello')

    const diagnostics = agentSession.getContextDiagnostics({ includePrompt: true })
    expect(diagnostics.prompt.sections.map((section) => section.key)).toContain('skill-catalog')
    expect(diagnostics.prompt.content).toContain('## Available Skills')
    expect(diagnostics.prompt.content).not.toContain('Review risks first')
  })

  it('builds MCP context prompt section from manager resources, prompts and instructions', () => {
    const manager = {
      getServerInfos: () => [{ name: 'docs', status: 'ready' }],
      getAllResources: () => [{ serverName: 'docs', name: 'Guide', uri: 'file:///guide.md' }],
      getAllPrompts: () => [{ serverName: 'docs', name: 'summarize' }],
      getServerInstructions: () => [
        { serverName: 'docs', instructions: 'Prefer project docs before external search.' },
      ],
    } as unknown as McpManager

    const section = buildMcpContextSection(manager)

    expect(section).toContain('### MCP Context')
    expect(section).toContain('Connected MCP servers: docs')
    expect(section).toContain('Prefer project docs before external search.')
    expect(section).toContain('Guide (file:///guide.md)')
    expect(section).toContain('docs: summarize')
  })

  it('injects tool availability and deferred tool prompt sections', async () => {
    const registry = new ToolRegistry()
    registry.register(
      {
        name: 'read',
        description: 'read files',
        parameters: createSchema<Record<string, unknown>>() as never,
        readonly: true,
        async execute() {
          return { content: [{ type: 'text' as const, text: 'ok' }] }
        },
      },
      { preset: 'minimal', category: 'fs', builtin: true, guideline: 'Read before editing.' },
    )
    registry.register(
      {
        name: 'web_search',
        description: 'search the web',
        parameters: createSchema<Record<string, unknown>>() as never,
        readonly: true,
        async execute() {
          return { content: [{ type: 'text' as const, text: 'ok' }] }
        },
      },
      { preset: 'standard', category: 'web', builtin: true, shouldDefer: true },
    )

    const hooks = createHookRegistry({ preset: 'none' })
    hooks.register(createToolGuidanceHook(registry, () => 'standard'))

    const sessionStore = createInMemorySessionStore()
    const session = await sessionStore.createSession('session-tool-guidance-sections')
    const agent = new Agent({ stream: makeOneTurnStream() })
    const agentSession = new AgentSession(session, agent, {
      model: makeModel(),
      systemPrompt: 'base system',
      hookRegistry: hooks,
    })

    await agentSession.prompt('hello')

    const diagnostics = agentSession.getContextDiagnostics()
    const sectionKeys = diagnostics.prompt.sections.map((section) => section.key)

    expect(sectionKeys).toEqual(expect.arrayContaining([
      'system-prompt',
      'tool-availability',
      'deferred-tools',
      'tool-guidance',
    ]))
    expect(diagnostics.prompt.content).toBeUndefined()

    const visible = agentSession.getContextDiagnostics({ includePrompt: true })
    expect(visible.prompt.content).toContain('### Tool Availability')
    expect(visible.prompt.content).toContain('Deferred tools: web_search')
    expect(visible.prompt.content).toContain('Use `tool_search`')
  })

  it('runs system prompt section hooks before legacy system prompt transform hooks', async () => {
    const seenContexts: StreamContext[] = []
    const stream = (context: StreamContext, _signal: AbortSignal) => {
      seenContexts.push(context)
      const eventStream = createEventStream<StreamEvent, AssistantMessage>()
      const response = makeAssistantMessage([{ type: 'text', text: 'ok' }], 'end_turn')

      setTimeout(() => {
        eventStream.push({ type: 'start', partial: response })
        eventStream.complete(response)
      }, 0)

      return eventStream
    }

    const hooks = createHookRegistry({ preset: 'none' })
    hooks.on('system-prompt.sections.transform', 'append-section', (_input, output) => {
      output.assembly = appendPromptSection(output.assembly, {
        key: 'runtime-section',
        content: 'runtime section',
        layer: 'dynamic',
        cacheable: false,
        source: 'test',
        priority: 20,
      })
    })
    hooks.on('system-prompt.transform', 'append-legacy', (input, output) => {
      output.systemPrompt = `${input.systemPrompt}\n\nlegacy suffix`
    })

    const sessionStore = createInMemorySessionStore()
    const session = await sessionStore.createSession('session-system-prompt-sections')
    const agent = new Agent({ stream })
    const agentSession = new AgentSession(session, agent, {
      model: makeModel(),
      systemPrompt: 'base system',
      hookRegistry: hooks,
    })

    await agentSession.prompt('hello')

    expect(seenContexts).toHaveLength(1)
    expect(seenContexts[0]?.systemPrompt).toBe('base system\n\nruntime section\n\nlegacy suffix')
    expect(seenContexts[0]?.promptCache).toMatchObject({
      staticPrefix: 'base system',
      dynamicTail: 'runtime section\n\nlegacy suffix',
    })
    expect(seenContexts[0]?.promptCache?.diagnostics.sections[0]).toMatchObject({
      key: 'system-prompt',
      cacheable: true,
    })
  })

  it('changes prompt cache tool fingerprint when available tools change', async () => {
    const seenContexts: StreamContext[] = []
    const stream = (context: StreamContext, _signal: AbortSignal) => {
      seenContexts.push(context)
      const eventStream = createEventStream<StreamEvent, AssistantMessage>()
      const response = makeAssistantMessage([{ type: 'text', text: 'ok' }], 'end_turn')

      setTimeout(() => {
        eventStream.push({ type: 'start', partial: response })
        eventStream.complete(response)
      }, 0)

      return eventStream
    }

    const readTool = {
      name: 'read',
      description: 'read tool',
      parameters: createSchema<Record<string, unknown>>() as never,
      async execute() {
        return { content: [{ type: 'text' as const, text: 'read' }] }
      },
    }
    const writeTool = {
      name: 'write',
      description: 'write tool',
      parameters: createSchema<Record<string, unknown>>() as never,
      async execute() {
        return { content: [{ type: 'text' as const, text: 'write' }] }
      },
    }

    const sessionStore = createInMemorySessionStore()
    const first = new AgentSession(await sessionStore.createSession('session-cache-tools-a'), new Agent({ stream }), {
      model: makeModel(),
      systemPrompt: 'system',
      tools: [readTool],
      hookRegistry: createHookRegistry({ preset: 'none' }),
    })
    const second = new AgentSession(await sessionStore.createSession('session-cache-tools-b'), new Agent({ stream }), {
      model: makeModel(),
      systemPrompt: 'system',
      tools: [readTool, writeTool],
      hookRegistry: createHookRegistry({ preset: 'none' }),
    })

    await first.prompt('hello')
    await second.prompt('hello')

    expect(seenContexts).toHaveLength(2)
    expect(seenContexts[0]?.promptCache?.toolSchemaFingerprint).toBeDefined()
    expect(seenContexts[1]?.promptCache?.toolSchemaFingerprint).toBeDefined()
    expect(seenContexts[0]?.promptCache?.toolSchemaFingerprint).not.toBe(
      seenContexts[1]?.promptCache?.toolSchemaFingerprint,
    )
  })

  it('runs message, params, transform, and tool hooks through AgentSession', async () => {
    const seenContexts: StreamContext[] = []
    const stream = (context: StreamContext, _signal: AbortSignal) => {
      seenContexts.push(context)
      const eventStream = createEventStream<StreamEvent, AssistantMessage>()

      setTimeout(() => {
        const hasToolResult = context.messages.some((message) => {
          return typeof message === 'object' && message !== null && 'role' in message && message.role === 'tool_result'
        })

        const response = hasToolResult
          ? makeAssistantMessage([{ type: 'text', text: 'complete' }], 'end_turn')
          : makeAssistantMessage([makeToolCall('echo', 'tc_echo', { value: 'from-model' })], 'tool_use')

        eventStream.push({ type: 'start', partial: response })
        eventStream.complete(response)
      }, 0)

      return eventStream
    }

    const hooks = createHookRegistry({ preset: 'none' })
    hooks.on('chat.message.before', 'rewrite-user-message', (_input, output) => {
      output.message = {
        ...(output.message as { role: 'user'; timestamp: number; content: Array<{ type: 'text'; text: string }> }),
        content: [{ type: 'text', text: 'rewritten by hook' }],
      }
    })
    hooks.on('messages.transform', 'prepend-transform-message', (input, output) => {
      output.messages = [
        { role: 'user', timestamp: Date.now(), content: [{ type: 'text', text: 'transform marker' }] },
        ...input.messages,
      ]
    })
    hooks.on('chat.params', 'set-chat-params', (_input, output) => {
      output.maxTokens = 77
      output.temperature = 0.25
      output.thinkingLevel = 'high'
    })
    hooks.on('tool.execute.before', 'rewrite-tool-args', (_input, output) => {
      output.args = { value: 'from-before-hook' }
    })
    hooks.on('tool.execute.after', 'rewrite-tool-result', (_input, output) => {
      output.result = {
        ...output.result,
        content: [{ type: 'text', text: 'from-after-hook' }],
      }
    })

    const tool = {
      name: 'echo',
      description: 'echo tool',
      parameters: createSchema<Record<string, unknown>>() as never,
      async execute(ctx: { params: Record<string, unknown> }) {
        return {
          content: [{ type: 'text' as const, text: String(ctx.params.value) }],
        }
      },
    }

    const sessionStore = createInMemorySessionStore()
    const session = await sessionStore.createSession('session-1')
    const agent = new Agent({ stream })
    const agentSession = new AgentSession(session, agent, {
      model: makeModel(),
      systemPrompt: 'system',
      tools: [tool],
      hookRegistry: hooks,
    })

    await agentSession.prompt('original prompt')

    expect(seenContexts).toHaveLength(2)
    expect(seenContexts[0]?.messages[0]).toEqual({
      role: 'user',
      timestamp: expect.any(Number),
      content: [{ type: 'text', text: 'transform marker' }],
    })
    expect(seenContexts[0]?.messages[1]).toEqual({
      role: 'user',
      timestamp: expect.any(Number),
      content: [{ type: 'text', text: 'rewritten by hook' }],
    })
    expect(seenContexts[0]?.maxTokens).toBe(77)
    expect(seenContexts[0]?.temperature).toBe(0.25)
    expect(seenContexts[0]?.thinkingLevel).toBe('high')

    const persistedMessages = session.messages()
    expect(persistedMessages[0]).toEqual({
      role: 'user',
      timestamp: expect.any(Number),
      content: [{ type: 'text', text: 'rewritten by hook' }],
    })

    const toolResultMessage = persistedMessages.find((message) => {
      return typeof message === 'object' && message !== null && 'role' in message && message.role === 'tool_result'
    }) as { role: 'tool_result'; content: Array<{ type: string; text?: string }> } | undefined

    expect(toolResultMessage?.content[0]?.text).toBe('from-after-hook')
  })

  it('emits session lifecycle hooks through XMarsApp', async () => {
    const lifecycleEvents: string[] = []
    const hooks = createHookRegistry({ preset: 'none' })
    hooks.on('session.created', 'track-created', (input) => {
      lifecycleEvents.push(`created:${input.sessionId}`)
    })
    hooks.on('session.deleted', 'track-deleted', (input) => {
      lifecycleEvents.push(`deleted:${input.sessionId}`)
    })

    const providerRegistry = createProviderRegistry()
    providerRegistry.register('openai-completions', () => ({
      id: 'test-provider',
      displayName: 'Test Provider',
      converse(_model, _context, _options, _signal) {
        const eventStream = createEventStream<StreamEvent, AssistantMessage>()
        const response = makeAssistantMessage([{ type: 'text', text: 'ok' }], 'end_turn')
        setTimeout(() => {
          eventStream.push({ type: 'start', partial: response })
          eventStream.complete(response)
        }, 0)
        return eventStream
      },
    }))

    const app = createXMars({
      port: 0,
      inspect: false,
      logger: {
        name: 'x-mars-test',
        level: 'error',
        destination: 'stdout',
      },
      model: makeModel(),
      providerRegistry,
      hookRegistry: hooks,
    })

    const session = await app.createSession({ id: 'session-created' })
    expect(lifecycleEvents).toEqual(['created:session-created'])

    expect(await app.removeSession(session.id)).toBe(true)
    expect(lifecycleEvents).toEqual(['created:session-created', 'deleted:session-created'])
  })

  it('emits compaction.before and compaction.after hooks', async () => {
    const compactionEvents: string[] = []
    const hooks = createHookRegistry({ preset: 'none' })
    hooks.on('compaction.before', 'track-compaction-before', (input) => {
      compactionEvents.push(`before:${input.messageCount}`)
    })
    hooks.on('compaction.after', 'track-compaction-after', (input) => {
      compactionEvents.push(`after:${input.retainedCount}`)
    })

    const stream = (_context: StreamContext, _signal: AbortSignal) => {
      const eventStream = createEventStream<StreamEvent, AssistantMessage>()
      const response = makeAssistantMessage([{ type: 'text', text: 'ok' }], 'end_turn')
      setTimeout(() => {
        eventStream.push({ type: 'start', partial: response })
        eventStream.complete(response)
      }, 0)
      return eventStream
    }

    const sessionStore = createInMemorySessionStore()
    const session = await sessionStore.createSession('session-compact')
    const agent = new Agent({ stream })
    const agentSession = new AgentSession(session, agent, {
      model: makeModel(),
      systemPrompt: 'system',
      hookRegistry: hooks,
    })

    // 填充一些消息
    await agentSession.prompt('message 1')
    await agentSession.prompt('message 2')

    const messageCountBefore = session.messages().length
    await agentSession.compact('summary of conversation', 2)

    expect(compactionEvents[0]).toBe(`before:${messageCountBefore}`)
    expect(compactionEvents[1]).toMatch(/^after:\d+$/)
  })

  it('emits background.start and background.end hooks through XMarsApp', async () => {
    const bgEvents: string[] = []
    const hooks = createHookRegistry({ preset: 'none' })
    hooks.on('background.start', 'track-bg-start', (input) => {
      bgEvents.push(`start:${input.taskId}:${input.agentName}`)
    })
    hooks.on('background.end', 'track-bg-end', (input) => {
      bgEvents.push(`end:${input.taskId}:${input.agentName}:${input.success}`)
    })

    const app = createXMars({
      port: 0,
      inspect: false,
      logger: {
        name: 'x-mars-test',
        level: 'error',
        destination: 'stdout',
      },
      hookRegistry: hooks,
    })

    await app.hookRegistry.emit('background.start', { taskId: 'task-1', agentName: 'worker-agent' })
    await app.hookRegistry.emit('background.end', { taskId: 'task-1', agentName: 'worker-agent', success: true })

    expect(bgEvents).toEqual([
      'start:task-1:worker-agent',
      'end:task-1:worker-agent:true',
    ])
  })
})
