import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createProviderRegistry } from '@x-mars/ai'
import type { AssistantMessage, Model, ProviderStream } from '@x-mars/ai'
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
    model: 'openai/scheduler-test-model',
  }
}

function makeProviderRegistry() {
  const registry = createProviderRegistry()
  registry.getModelRegistry().register(makeModel('openai/scheduler-test-model'))
  registry.register(
    'github-copilot',
    (): ProviderStream => ({
      id: 'scheduler-test-openai',
      displayName: 'Scheduler Test Provider',
      async *converse() {
        const message = makeAssistant('scheduled task complete')
        yield { type: 'start' as const, partial: message }
        yield { type: 'done' as const, reason: 'end_turn' as const, message }
      },
    }),
  )
  return registry
}

describe('XMarsApp scheduler wiring', () => {
  function createSchedulerTestApp(workspaceDir: string) {
    return createXMars({
      port: 0,
      inspect: false,
      logger: {
        name: 'x-mars-app-scheduler-test',
        level: 'error',
        destination: 'stdout',
      },
      workspaceDir,
      model: makeModel('openai/scheduler-test-model'),
      providerRegistry: makeProviderRegistry(),
    })
  }

  it('exposes scheduler_job through the app registry and dispatches background tasks', async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), 'x-mars-app-scheduler-'))
    const app = createSchedulerTestApp(workspaceDir)

    try {
      const tool = app.toolRegistry.get('scheduler_job')
      expect(tool).toBeDefined()
      const parent = await app.createSession({ id: 'scheduler-parent-session' })

      const created = await tool!.execute({
        id: 'scheduler-create',
        params: {
          action: 'create',
          prompt: 'run scheduled smoke task',
          schedule: 'every 1m',
          subagent: 'explorer',
        },
        signal: new AbortController().signal,
        sessionId: parent.id,
      })
      const jobId = (created.details as { job?: { id?: string } } | undefined)?.job?.id

      expect(created.isError).toBeUndefined()
      expect(jobId).toBeDefined()

      const triggered = await tool!.execute({
        id: 'scheduler-trigger',
        params: { action: 'trigger', jobId },
        signal: new AbortController().signal,
      })
      const dispatched = (
        triggered.details as
          | {
              tick?: {
                dispatched?: Array<{ jobId: string; taskId?: string; success: boolean }>
              }
            }
          | undefined
      )?.tick?.dispatched

      expect(triggered.isError).toBeUndefined()
      expect(dispatched).toEqual([
        expect.objectContaining({ jobId, success: true, taskId: expect.any(String) }),
      ])
      const task = await (
        app as unknown as {
          orchestrator: {
            taskStore: {
              get: (id: string) => Promise<{ input?: { parentSessionId?: string } } | undefined>
            }
          }
        }
      ).orchestrator.taskStore.get(dispatched?.[0]?.taskId ?? '')
      expect(task?.input?.parentSessionId).toBe(parent.id)

      const listed = await tool!.execute({
        id: 'scheduler-list',
        params: { action: 'list' },
        signal: new AbortController().signal,
      })
      const jobs = (listed.details as { jobs?: Array<{ id: string; lastTaskId?: string }> }).jobs

      expect(jobs).toEqual([
        expect.objectContaining({
          id: jobId,
          lastTaskId: dispatched?.[0]?.taskId,
        }),
      ])
    } finally {
      await app.stop()
    }
  })

  it('persists scheduler jobs in the workspace between app instances', async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), 'x-mars-app-scheduler-persist-'))
    const firstApp = createSchedulerTestApp(workspaceDir)

    try {
      const created = await firstApp.toolRegistry.get('scheduler_job')!.execute({
        id: 'scheduler-persist-create',
        params: {
          action: 'create',
          prompt: 'persist workspace scheduler job',
          schedule: '@hourly',
        },
        signal: new AbortController().signal,
      })

      expect(created.isError).toBeUndefined()
    } finally {
      await firstApp.stop()
    }

    const secondApp = createSchedulerTestApp(workspaceDir)
    try {
      const listed = await secondApp.toolRegistry.get('scheduler_job')!.execute({
        id: 'scheduler-persist-list',
        params: { action: 'list' },
        signal: new AbortController().signal,
      })
      const jobs = (listed.details as { jobs?: Array<{ prompt: string; schedule: string }> }).jobs

      expect(jobs).toEqual([
        expect.objectContaining({
          prompt: 'persist workspace scheduler job',
          schedule: '@hourly',
        }),
      ])
    } finally {
      await secondApp.stop()
    }
  })
})
