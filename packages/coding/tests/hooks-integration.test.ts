import { describe, expect, it } from 'vitest'
import { Agent } from '@vitamin/agent'
import { createEventStream, type AssistantMessage, type Model, type StreamContext, type StreamEvent, type ToolCall } from '@vitamin/ai'
import { createHookRegistry } from '@vitamin/hooks'
import { createInMemorySessionStore } from '@vitamin/session'

import { AgentSession } from '../src/session/agent-session'
import { createVitamin } from '../src/app/vitamin-app'
import { createProviderRegistry } from '@vitamin/ai'

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

describe('coding hooks integration', () => {
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

  it('emits session lifecycle hooks through VitaminApp', async () => {
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

    const app = createVitamin({
      port: 0,
      inspect: false,
      logger: {
        name: 'vitamin-test',
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

  it('emits background.start and background.end hooks through VitaminApp', async () => {
    const bgEvents: string[] = []
    const hooks = createHookRegistry({ preset: 'none' })
    hooks.on('background.start', 'track-bg-start', (input) => {
      bgEvents.push(`start:${input.taskId}:${input.agentName}`)
    })
    hooks.on('background.end', 'track-bg-end', (input) => {
      bgEvents.push(`end:${input.taskId}:${input.agentName}:${input.success}`)
    })

    const app = createVitamin({
      port: 0,
      inspect: false,
      logger: {
        name: 'vitamin-test',
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