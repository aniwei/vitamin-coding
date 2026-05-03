import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createDefaultProviderRegistry, createProviderRegistry } from '@x-mars/ai'
import type { AssistantMessage, Model, ProviderStream } from '@x-mars/ai'
import { isPromptAssembly } from '@x-mars/prompt'
import { createXMars } from '../src/app/x-mars-app'

function makeModel(id: string): Model {
  const [, name = id] = id.split('/')

  return {
    id,
    name,
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: 'https://example.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxOutputTokens: 4096,
  }
}

function makeAssistant(text: string): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'openai-completions',
    provider: 'openai',
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
    stopReason: 'end_turn',
    model: 'openai/test-model',
  }
}

function makeStreamingProviderRegistry(text: string) {
  const registry = createProviderRegistry()
  registry.getModelRegistry().register(makeModel('openai/test-model'))
  registry.register(
    'github-copilot',
    (): ProviderStream => ({
      id: 'test-openai',
      displayName: 'Test OpenAI',
      async *converse() {
        const message = makeAssistant(text)
        yield { type: 'start' as const, partial: message }
        yield { type: 'done' as const, reason: 'end_turn' as const, message }
      },
    }),
  )
  return registry
}

function toSystemPrompt(
  value: Awaited<
    ReturnType<
      NonNullable<
        Awaited<ReturnType<ReturnType<typeof createXMars>['createSession']>>['promptRefresh']
      >
    >
  >,
): string {
  if (isPromptAssembly(value)) {
    return value.systemPrompt
  }
  return value ?? ''
}

describe('XMarsApp slot routing', () => {
  it('uses explicit slot mapping when creating a session', async () => {
    const baseModel = makeModel('openai/base-model')
    const reviewModel = makeModel('openai/review-model')
    const providerRegistry = createDefaultProviderRegistry()

    providerRegistry.getModelRegistry().registerMany([baseModel, reviewModel])

    const app = createXMars({
      port: 0,
      inspect: false,
      logger: {
        name: 'x-mars-slot-test',
        level: 'error',
        destination: 'stdout',
      },
      model: baseModel,
      providerRegistry,
    })

    try {
      await app.settings.update({
        model_slots: {
          default: baseModel.id,
          slots: {
            critique: reviewModel.id,
          },
        },
      })

      const session = await app.createSession({
        id: 'slot-explicit',
        slot: 'critique',
      })

      expect(session.model.id).toBe(reviewModel.id)
    } finally {
      await app.stop()
    }
  })

  it('uses agent default slot when caller does not provide one', async () => {
    const baseModel = makeModel('openai/default-model')
    const reviewModel = makeModel('openai/quality-review-model')
    const providerRegistry = createDefaultProviderRegistry()

    providerRegistry.getModelRegistry().registerMany([baseModel, reviewModel])

    const app = createXMars({
      port: 0,
      inspect: false,
      logger: {
        name: 'x-mars-slot-agent-default-test',
        level: 'error',
        destination: 'stdout',
      },
      model: baseModel,
      providerRegistry,
    })

    try {
      await app.settings.update({
        agents: {
          'quality-reviewer': {
            default_workflow_slot: 'critique',
          },
        },
        model_slots: {
          default: baseModel.id,
          slots: {
            critique: reviewModel.id,
          },
        },
      })

      const session = await app.createSession({
        id: 'slot-agent-default',
        agentName: 'quality-reviewer',
      })

      expect(session.model.id).toBe(reviewModel.id)
    } finally {
      await app.stop()
    }
  })

  it('uses subagent prompt preset and profile tool defaults for named worker sessions', async () => {
    const baseModel = makeModel('openai/subagent-model')
    const providerRegistry = createDefaultProviderRegistry()

    providerRegistry.getModelRegistry().register(baseModel)

    const app = createXMars({
      port: 0,
      inspect: false,
      logger: {
        name: 'x-mars-subagent-preset-test',
        level: 'error',
        destination: 'stdout',
      },
      model: baseModel,
      providerRegistry,
    })

    try {
      const session = await app.createSession({
        id: 'subagent-preset',
        agentName: 'quality-reviewer',
      })

      const prompt = toSystemPrompt(await session.promptRefresh?.())
      const toolNames = session.tools.map((tool) => tool.name).sort()

      expect(prompt).toContain('代码审查专项子代理')
      expect(toolNames).toEqual(['bash', 'find', 'grep', 'ls', 'read'])
    } finally {
      await app.stop()
    }
  })

  it('loads file-based subagent profiles from .x-mars/agents', async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), 'x-mars-file-agent-'))
    await mkdir(join(workspaceDir, '.x-mars', 'agents'), { recursive: true })
    await writeFile(
      join(workspaceDir, '.x-mars', 'agents', 'test-runner.md'),
      [
        '---',
        'description: Runs focused verification',
        'tools: [read, grep, bash]',
        'default_workflow_slot: compact',
        'max_tool_turns: 6',
        '---',
        'You are the file based test runner.',
      ].join('\n'),
      'utf-8',
    )

    const baseModel = makeModel('openai/file-agent-base')
    const compactModel = makeModel('openai/file-agent-compact')
    const providerRegistry = createDefaultProviderRegistry()

    providerRegistry.getModelRegistry().registerMany([baseModel, compactModel])

    const app = createXMars({
      port: 0,
      inspect: false,
      logger: {
        name: 'x-mars-file-agent-test',
        level: 'error',
        destination: 'stdout',
      },
      workspaceDir,
      model: baseModel,
      providerRegistry,
    })

    try {
      await app.settings.update({
        model_slots: {
          default: baseModel.id,
          slots: {
            compact: compactModel.id,
          },
        },
      })

      await app.toolRegistry.get('task_create')!.execute({
        id: 'task-create-file-agent',
        params: { prompt: 'verify runtime catalog', subagent: 'test-runner' },
        signal: new AbortController().signal,
      })
      const agentList = app.toolRegistry.get('agent_list')
      const listed = await agentList!.execute({
        id: 'agent-list-file',
        params: {},
        signal: new AbortController().signal,
      })
      const listedAgents = listed.details?.agents as Array<{
        name: string
        source: string
        filePath?: string
        tools?: string[]
        activeTaskCount?: number
        lastTaskStatus?: string
      }>

      const session = await app.createSession({
        id: 'file-agent-session',
        agentName: 'test-runner',
      })

      const prompt = toSystemPrompt(await session.promptRefresh?.())
      const toolNames = session.tools.map((tool) => tool.name).sort()

      expect(session.model.id).toBe(compactModel.id)
      expect(session.maxToolTurns).toBe(6)
      expect(prompt).toBe('You are the file based test runner.')
      expect(toolNames).toEqual(['bash', 'grep', 'read'])
      expect(listedAgents).toContainEqual(
        expect.objectContaining({
          name: 'test-runner',
          source: 'file',
          filePath: join(workspaceDir, '.x-mars', 'agents', 'test-runner.md'),
          tools: ['read', 'grep', 'bash'],
          activeTaskCount: 1,
          lastTaskStatus: 'pending',
        }),
      )

      const cancelled = await app.toolRegistry.get('agent_cancel')!.execute({
        id: 'agent-cancel-file',
        params: { agent: 'test-runner', includePending: true },
        signal: new AbortController().signal,
      })
      const relisted = await agentList!.execute({
        id: 'agent-list-file-after-cancel',
        params: {},
        signal: new AbortController().signal,
      })
      const relistedAgents = relisted.details?.agents as Array<{
        name: string
        activeTaskCount?: number
        lastTaskStatus?: string
      }>

      expect(cancelled.isError).toBe(false)
      expect(cancelled.content[0]?.text).toContain('Agent test-runner cancel completed')
      expect(relistedAgents).toContainEqual(
        expect.objectContaining({
          name: 'test-runner',
          lastTaskStatus: 'cancelled',
        }),
      )
    } finally {
      await app.stop()
    }
  })

  it('applies workflow max_active_tasks to delegated subagent tasks', async () => {
    const baseModel = makeModel('openai/max-active-agent-model')
    const providerRegistry = createDefaultProviderRegistry()

    providerRegistry.getModelRegistry().register(baseModel)

    const app = createXMars({
      port: 0,
      inspect: false,
      logger: {
        name: 'x-mars-max-active-agent-test',
        level: 'error',
        destination: 'stdout',
      },
      model: baseModel,
      providerRegistry,
    })

    try {
      await app.settings.update({
        workflow: {
          max_active_tasks: 1,
        },
      })

      const created = await app.toolRegistry.get('task_create')!.execute({
        id: 'task-create-running-agent',
        params: { prompt: 'already running', subagent: 'explorer' },
        signal: new AbortController().signal,
      })
      const taskId = (created.details as { taskId?: string } | undefined)?.taskId
      expect(taskId).toBeDefined()
      await (
        app as unknown as {
          orchestrator: {
            taskStore: {
              update: (id: string, patch: { status: 'running' }) => Promise<unknown>
            }
          }
        }
      ).orchestrator.taskStore.update(taskId, {
        status: 'running',
      })

      const delegated = await app.toolRegistry.get('task_delegate')!.execute({
        id: 'delegate-over-limit',
        params: {
          prompt: 'second task',
          subagent: 'explorer',
          mode: 'background',
        },
        signal: new AbortController().signal,
      })

      expect(delegated.isError).toBe(true)
      expect(delegated.content[0]?.text).toContain('Max active tasks reached (1)')
    } finally {
      await app.stop()
    }
  })

  it('allows caller to force the main prompt preset even when agentName is provided', async () => {
    const baseModel = makeModel('openai/main-override-model')
    const providerRegistry = createDefaultProviderRegistry()

    providerRegistry.getModelRegistry().register(baseModel)

    const app = createXMars({
      port: 0,
      inspect: false,
      logger: {
        name: 'x-mars-main-preset-override-test',
        level: 'error',
        destination: 'stdout',
      },
      model: baseModel,
      providerRegistry,
    })

    try {
      const session = await app.createSession({
        id: 'main-preset-override',
        agentName: 'quality-reviewer',
        promptPreset: 'main',
      })

      const prompt = toSystemPrompt(await session.promptRefresh?.())
      const toolNames = session.tools.map((tool) => tool.name)

      expect(prompt).toContain('Identity & Environment')
      expect(prompt).toContain('Workflow Guidance')
      expect(toolNames).toContain('write')
      expect(toolNames).toContain('task_delegate')
    } finally {
      await app.stop()
    }
  })

  it('forks sticky task_delegate sidechain sessions from the parent session', async () => {
    const providerRegistry = makeStreamingProviderRegistry('child summary')
    const app = createXMars({
      port: 0,
      inspect: false,
      logger: {
        name: 'x-mars-sidechain-test',
        level: 'error',
        destination: 'stdout',
      },
      model: makeModel('openai/test-model'),
      providerRegistry,
    })

    try {
      const parent = await app.createSession({ id: 'parent-sidechain' })
      parent.session.append({
        role: 'user',
        timestamp: Date.now(),
        content: [{ type: 'text', text: 'parent context' }],
      })

      const tool = app.toolRegistry.get('task_delegate')
      expect(tool).toBeDefined()

      const result = await tool!.execute({
        id: 'delegate-1',
        params: {
          prompt: 'inspect child task',
          subagent: 'explorer',
          mode: 'sync',
          sessionId: 'child-sidechain-sticky',
          sessionMode: 'sticky',
          timeoutMs: 1500,
        },
        signal: new AbortController().signal,
        sessionId: parent.id,
      })

      const child = app.getSession('child-sidechain-sticky')
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''

      expect(text).toContain('child summary')
      expect(child).toBeDefined()
      expect(child?.permissionMetadata).toEqual({
        sidechain: {
          taskId: expect.any(String),
          parentTaskId: undefined,
          parentSessionId: 'parent-sidechain',
          subagent: 'explorer',
          category: undefined,
          policy: {
            returnMode: 'summary_only',
            permissionMode: 'inherit',
            timeoutMs: 1500,
            allowedTools: undefined,
            deniedTools: undefined,
          },
        },
      })
      expect(
        child?.session
          .messages()
          .some(
            (message) =>
              message.role === 'user' &&
              Array.isArray(message.content) &&
              message.content.some(
                (part) => part.type === 'text' && part.text === 'parent context',
              ),
          ),
      ).toBe(true)
    } finally {
      await app.stop()
    }
  })

  it('cleans up ephemeral sidechain child sessions after completion', async () => {
    const providerRegistry = makeStreamingProviderRegistry('ephemeral child summary')
    const app = createXMars({
      port: 0,
      inspect: false,
      logger: {
        name: 'x-mars-sidechain-ephemeral-test',
        level: 'error',
        destination: 'stdout',
      },
      model: makeModel('openai/test-model'),
      providerRegistry,
    })

    try {
      const parent = await app.createSession({ id: 'parent-sidechain-ephemeral' })
      const tool = app.toolRegistry.get('task_delegate')
      expect(tool).toBeDefined()

      const result = await tool!.execute({
        id: 'delegate-ephemeral',
        params: {
          prompt: 'run child task',
          subagent: 'explorer',
          mode: 'sync',
          sessionMode: 'ephemeral',
        },
        signal: new AbortController().signal,
        sessionId: parent.id,
      })

      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(result.isError).toBeUndefined()
      expect(text).toContain('ephemeral child summary')
      expect(app.listSessions().map((session) => session.id)).toEqual([
        'parent-sidechain-ephemeral',
      ])
    } finally {
      await app.stop()
    }
  })
})
