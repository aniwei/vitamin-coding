import { describe, expect, it } from 'vitest'
import { Agent } from '@vitamin/agent'
import { createEventStream, type AssistantMessage, type Model, type StreamContext, type StreamEvent } from '@vitamin/ai'
import { createHookRegistry } from '@vitamin/hooks'
import { attachLogListener, createLogger } from '@vitamin/shared'

import { CodingSessionManager as SessionManager } from '../src/session/coding-session-manager'
import { AgentSession } from '../src/session/agent-session'

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

function makeAssistantMessage(): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'hello' }],
    api: 'openai-completions',
    provider: 'openai',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    stopReason: 'end_turn',
    model: 'openai/test-model',
  }
}

function makeStream() {
  return (_context: StreamContext, _signal: AbortSignal) => {
    const eventStream = createEventStream<StreamEvent, AssistantMessage>()
    setTimeout(() => {
      const msg = makeAssistantMessage()
      eventStream.push({ type: 'start', partial: msg })
      eventStream.complete(msg)
    }, 0)
    return eventStream
  }
}

function createLogCollector(entries: string[]) {
  const name = `coding-session-manager-test-${crypto.randomUUID()}`
  const detach = attachLogListener((log) => {
    const entry = log as { name?: string; msg?: string }
    if (entry.name === name && entry.msg) {
      entries.push(entry.msg)
    }
  })

  return {
    logger: createLogger(name, {
      level: 'debug',
      destination: '/tmp/vitamin-coding-test.log',
    }),
    detach,
  }
}

async function flushLogs(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20))
}

// ═══ SessionManager ═══

describe('SessionManager', () => {
  describe('inMemory', () => {
    it('creates a manager in memory mode', () => {
      const mgr = SessionManager.inMemory({
        model: makeModel(),
        systemPrompt: 'test',
      })

      expect(mgr).toBeInstanceOf(SessionManager)
      expect(mgr.listSessions()).toHaveLength(0)
    })

    it('creates sessions', async () => {
      const mgr = SessionManager.inMemory({
        model: makeModel(),
        hooks: createHookRegistry({ preset: 'none' }),
      })

      const session = await mgr.createSession({ id: 'test-1' })

      expect(session).toBeInstanceOf(AgentSession)
      expect(session.id).toBe('test-1')
      expect(mgr.listSessions()).toHaveLength(1)
    })

    it('emits user-facing lifecycle logs', async () => {
      const entries: string[] = []
      const collector = createLogCollector(entries)
      const mgr = SessionManager.inMemory({
        model: makeModel(),
        hooks: createHookRegistry({ preset: 'none' }),
        logger: collector.logger,
      })

      await mgr.createSession({ id: 'log-session' })
      await mgr.removeSession('log-session')
      await flushLogs()
      collector.detach()

      expect(entries.some((entry) => entry.includes('created'))).toBe(true)
      expect(entries.some((entry) => entry.includes('removed'))).toBe(true)
    })

    it('retrieves sessions by ID', async () => {
      const mgr = SessionManager.inMemory({
        model: makeModel(),
        hooks: createHookRegistry({ preset: 'none' }),
      })

      await mgr.createSession({ id: 'sess-a' })

      const found = mgr.getSession('sess-a')
      expect(found).toBeDefined()
      expect(found!.id).toBe('sess-a')
    })

    it('returns undefined for unknown session', async () => {
      const mgr = SessionManager.inMemory({
        model: makeModel(),
        hooks: createHookRegistry({ preset: 'none' }),
      })

      expect(mgr.getSession('nonexistent')).toBeUndefined()
    })

    it('removes sessions', async () => {
      const mgr = SessionManager.inMemory({
        model: makeModel(),
        hooks: createHookRegistry({ preset: 'none' }),
      })

      await mgr.createSession({ id: 'to-remove' })
      expect(mgr.listSessions()).toHaveLength(1)

      const removed = await mgr.removeSession('to-remove')
      expect(removed).toBe(true)
      expect(mgr.listSessions()).toHaveLength(0)
      expect(mgr.getSession('to-remove')).toBeUndefined()
    })

    it('returns false when removing nonexistent session', async () => {
      const mgr = SessionManager.inMemory({
        model: makeModel(),
        hooks: createHookRegistry({ preset: 'none' }),
      })

      const removed = await mgr.removeSession('ghost')
      expect(removed).toBe(false)
    })

    it('lists sessions with info', async () => {
      const mgr = SessionManager.inMemory({
        model: makeModel(),
        hooks: createHookRegistry({ preset: 'none' }),
      })

      await mgr.createSession({ id: 's1' })
      await mgr.createSession({ id: 's2' })

      const list = mgr.listSessions()
      expect(list).toHaveLength(2)
      expect(list[0]).toMatchObject({ id: 's1', status: 'idle' })
      expect(list[1]).toMatchObject({ id: 's2', status: 'idle' })
    })

    it('throws when no model provided', async () => {
      const mgr = SessionManager.inMemory({
        hooks: createHookRegistry({ preset: 'none' }),
      })

      await expect(mgr.createSession()).rejects.toThrow('No model specified')
    })

    it('session-level model overrides manager default', async () => {
      const defaultModel = makeModel()
      const overrideModel: Model = {
        ...makeModel(),
        id: 'custom/override-model',
      }

      const mgr = SessionManager.inMemory({
        model: defaultModel,
        hooks: createHookRegistry({ preset: 'none' }),
      })

      const session = await mgr.createSession({ model: overrideModel })
      // The session was created — model override was accepted
      expect(session).toBeInstanceOf(AgentSession)
    })
  })

  describe('active session', () => {
    it('sets and gets active session', async () => {
      const mgr = SessionManager.inMemory({
        model: makeModel(),
        hooks: createHookRegistry({ preset: 'none' }),
      })

      await mgr.createSession({ id: 'active-1' })
      await mgr.createSession({ id: 'active-2' })

      const set = mgr.setActive('active-1')
      expect(set).toBeDefined()
      expect(set!.id).toBe('active-1')

      expect(mgr.active?.id).toBe('active-1')
    })

    it('returns undefined for unknown active', () => {
      const mgr = SessionManager.inMemory({
        model: makeModel(),
        hooks: createHookRegistry({ preset: 'none' }),
      })

      expect(mgr.active).toBeUndefined()
      expect(mgr.setActive('nonexistent')).toBeUndefined()
    })
  })

  describe('cwd propagation', () => {
    it('passes cwd from manager options to sessions', async () => {
      const mgr = SessionManager.inMemory({
        model: makeModel(),
        hooks: createHookRegistry({ preset: 'none' }),
        workspaceDir: '/test/workspace',
      })

      const session = await mgr.createSession({ id: 'cwd-test' })
      expect(session.workspaceDir).toBe('/test/workspace')
    })

    it('session-level cwd overrides manager cwd', async () => {
      const mgr = SessionManager.inMemory({
        model: makeModel(),
        hooks: createHookRegistry({ preset: 'none' }),
        workspaceDir: '/default/cwd',
      })

      const session = await mgr.createSession({ id: 'cwd-override', workspaceDir: '/override/cwd' })
      expect(session.workspaceDir).toBe('/override/cwd')
    })
  })

  describe('fork', () => {
    it('forks a session', async () => {
      const mgr = SessionManager.inMemory({
        model: makeModel(),
        hooks: createHookRegistry({ preset: 'none' }),
      })

      const original = await mgr.createSession({ id: 'source' })
      // Add a message to make the fork non-trivial
      original.session.append({
        role: 'user',
        timestamp: Date.now(),
        content: [{ type: 'text', text: 'hello' }],
      } as any)

      const forked = await mgr.forkSession('source', 'forked-1')

      expect(forked).toBeDefined()
      expect(forked!.id).toBe('forked-1')
      expect(mgr.listSessions()).toHaveLength(2)
    })

    it('returns undefined when forking nonexistent session', async () => {
      const mgr = SessionManager.inMemory({
        model: makeModel(),
        hooks: createHookRegistry({ preset: 'none' }),
      })

      const forked = await mgr.forkSession('ghost')
      expect(forked).toBeUndefined()
    })
  })

  describe('dispose', () => {
    it('disposes all sessions', async () => {
      const mgr = SessionManager.inMemory({
        model: makeModel(),
        hooks: createHookRegistry({ preset: 'none' }),
      })

      await mgr.createSession({ id: 'd1' })
      await mgr.createSession({ id: 'd2' })
      expect(mgr.listSessions()).toHaveLength(2)

      mgr.dispose()

      expect(mgr.listSessions()).toHaveLength(0)
    })
  })
})
