import { describe, expect, it } from 'vitest'
import {
  createDefaultProviderRegistry,
  type AssistantMessage,
  type Message,
  type Model,
} from '@x-mars/ai'
import { createHookRegistry } from '@x-mars/hooks'
import { InMemorySessionPersistence } from '@x-mars/session'
import { attachLogListener, createLogger } from '@x-mars/shared'

import {
  CodingSessionManager as SessionManager,
  createInMemoryCodingSessionManager,
} from '../src/session/coding-session-manager'
import { AgentSession } from '../src/session/agent-session'

const defaultProviderRegistry = createDefaultProviderRegistry()

function makeModel(): Model {
  return {
    id: 'github-copilot/test-model',
    name: 'test-model',
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

function makeAssistantMessage(): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'hello' }],
    api: 'github-copilot',
    provider: 'github-copilot',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    stopReason: 'end_turn',
    model: 'github-copilot/test-model',
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
      destination: '/tmp/x-mars-coding-test.log',
    }),
    detach,
  }
}

async function flushLogs(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20))
}

function createManager(
  overrides: Partial<Parameters<typeof createInMemoryCodingSessionManager>[0]> = {},
) {
  return createInMemoryCodingSessionManager({
    model: makeModel(),
    hookRegistry: createHookRegistry({ preset: 'none' }),
    providerRegistry: defaultProviderRegistry,
    logger: createLogger('test-session-manager'),
    workspaceDir: process.cwd(),
    ...overrides,
  })
}

function makeUserTextMessage(text: string): Message {
  return {
    role: 'user',
    timestamp: Date.now(),
    content: [{ type: 'text', text }],
  }
}

function makeAssistantTextMessage(text: string): Message {
  return {
    ...makeAssistantMessage(),
    content: [{ type: 'text', text }],
  }
}

// ═══ SessionManager ═══

describe('SessionManager', () => {
  describe('inMemory', () => {
    it('creates a manager in memory mode', () => {
      const mgr = createManager({ systemPrompt: 'test' })

      expect(mgr).toBeInstanceOf(SessionManager)
      expect(mgr.listSessions()).toHaveLength(0)
    })

    it('creates sessions', async () => {
      const mgr = createManager()

      const session = await mgr.createSession({ id: 'test-1' })

      expect(session).toBeInstanceOf(AgentSession)
      expect(session.id).toBe('test-1')
      expect(mgr.listSessions()).toHaveLength(1)
    })

    it('emits user-facing lifecycle logs', async () => {
      const entries: string[] = []
      const collector = createLogCollector(entries)
      const mgr = createManager({ logger: collector.logger })

      await mgr.createSession({ id: 'log-session' })
      await mgr.removeSession('log-session')
      await flushLogs()
      collector.detach()

      expect(entries.some((entry) => entry.includes('created'))).toBe(true)
      expect(entries.some((entry) => entry.includes('removed'))).toBe(true)
    })

    it('retrieves sessions by ID', async () => {
      const mgr = createManager()

      await mgr.createSession({ id: 'sess-a' })

      const found = mgr.getSession('sess-a')
      expect(found).toBeDefined()
      expect(found!.id).toBe('sess-a')
    })

    it('returns undefined for unknown session', async () => {
      const mgr = createManager()

      expect(mgr.getSession('nonexistent')).toBeUndefined()
    })

    it('removes sessions', async () => {
      const mgr = createManager()

      await mgr.createSession({ id: 'to-remove' })
      expect(mgr.listSessions()).toHaveLength(1)

      const removed = await mgr.removeSession('to-remove')
      expect(removed).toBe(true)
      expect(mgr.listSessions()).toHaveLength(0)
      expect(mgr.getSession('to-remove')).toBeUndefined()
    })

    it('returns false when removing nonexistent session', async () => {
      const mgr = createManager()

      const removed = await mgr.removeSession('ghost')
      expect(removed).toBe(false)
    })

    it('lists sessions with info', async () => {
      const mgr = createManager()

      await mgr.createSession({ id: 's1' })
      await mgr.createSession({ id: 's2' })

      const list = mgr.listSessions()
      expect(list).toHaveLength(2)
      expect(list[0]).toMatchObject({ id: 's1', status: 'idle' })
      expect(list[1]).toMatchObject({ id: 's2', status: 'idle' })
    })

    it('throws when no model provided', async () => {
      const mgr = createManager({ model: undefined })

      await expect(mgr.createSession()).rejects.toThrow('No model specified')
    })

    it('session-level model overrides manager default', async () => {
      const defaultModel = makeModel()
      const overrideModel: Model = {
        ...makeModel(),
        id: 'custom/override-model',
      }

      const mgr = createManager({ model: defaultModel })

      const session = await mgr.createSession({ model: overrideModel })
      // The session was created — model override was accepted
      expect(session).toBeInstanceOf(AgentSession)
    })

    it('session-level promptRefresh overrides manager default', async () => {
      const mgr = createManager({ promptRefresh: async () => 'manager-prompt' })

      const session = await mgr.createSession({
        id: 'prompt-refresh-override',
        promptRefresh: async () => 'session-prompt',
      })

      expect(await session.promptRefresh?.()).toBe('session-prompt')
    })

    it('searches active session messages by query', async () => {
      const mgr = createManager()
      const session = await mgr.createSession({ id: 'search-active' })
      session.session.append({
        ...makeUserTextMessage('Investigate web_fetch domain filtering regression'),
      })

      const results = await mgr.searchSessions({ query: 'domain filtering', limit: 3 })

      expect(results[0]).toMatchObject({
        id: 'search-active',
        messageCount: 1,
      })
      expect(results[0]?.matches[0]?.text).toContain('web_fetch domain filtering')
    })

    it('searches persisted sessions without restoring them', async () => {
      const persistence = new InMemorySessionPersistence()
      const first = new SessionManager(
        {
          model: makeModel(),
          hookRegistry: createHookRegistry({ preset: 'none' }),
          providerRegistry: defaultProviderRegistry,
          logger: createLogger('persisted-search-first'),
          workspaceDir: process.cwd(),
        },
        persistence,
      )
      const created = await first.createSession({ id: 'persisted-search' })
      created.session.updateMetadata({ title: 'Hermes comparison' })
      created.session.append({
        ...makeAssistantTextMessage('Hermes execute_code should become a safe RPC tool.'),
      })
      await first.save('persisted-search')

      const second = new SessionManager(
        {
          model: makeModel(),
          hookRegistry: createHookRegistry({ preset: 'none' }),
          providerRegistry: defaultProviderRegistry,
          logger: createLogger('persisted-search-second'),
          workspaceDir: process.cwd(),
        },
        persistence,
      )

      const results = await second.searchSessions({ query: 'execute_code RPC', limit: 5 })

      expect(second.listSessions()).toHaveLength(0)
      expect(results[0]).toMatchObject({
        id: 'persisted-search',
        title: 'Hermes comparison',
      })
    })

    it('uses indexed title and summary evidence for session search', async () => {
      const mgr = createManager()
      const titleSession = await mgr.createSession({ id: 'title-hit' })
      titleSession.session.updateMetadata({ title: 'FTS search roadmap' })

      const summarySession = await mgr.createSession({ id: 'summary-hit' })
      summarySession.session.updateMetadata({ parentSessionId: 'root-session' })
      summarySession.session.append({
        ...makeUserTextMessage('Earlier planning notes'),
      })
      summarySession.session.append({
        ...makeAssistantTextMessage('Unrelated message body'),
      })
      summarySession.session.compact('FTS index should return focused summary evidence.', 2)

      const results = await mgr.searchSessions({ query: 'FTS index', limit: 5 })

      expect(results[0]).toMatchObject({
        id: 'summary-hit',
        groupId: 'root-session',
      })
      expect(results[0]?.matchedTerms).toEqual(expect.arrayContaining(['fts', 'index']))
      expect(results[0]?.matches[0]).toMatchObject({
        source: 'summary',
        text: expect.stringContaining('FTS index'),
      })
      expect(results.map((result) => result.id)).toContain('title-hit')
    })

    it('scopes session search to the active workspace', async () => {
      const mgr = createManager({ workspaceDir: '/workspace/default' })
      const alpha = await mgr.createSession({
        id: 'workspace-alpha',
        workspaceDir: '/workspace/alpha',
      })
      alpha.session.append({
        ...makeUserTextMessage('Shared query belongs to alpha workspace'),
      })

      const beta = await mgr.createSession({
        id: 'workspace-beta',
        workspaceDir: '/workspace/beta',
      })
      beta.session.append({
        ...makeUserTextMessage('Shared query belongs to beta workspace'),
      })

      expect(beta.session.metadata().workspaceDir).toBe('/workspace/beta')

      const betaResults = await mgr.searchSessions({ query: 'shared query', limit: 5 })
      expect(betaResults.map((result) => result.id)).toEqual(['workspace-beta'])
      expect(betaResults[0]?.workspaceDir).toBe('/workspace/beta')

      mgr.setActive('workspace-alpha')
      const alphaResults = await mgr.searchSessions({ query: 'shared query', limit: 5 })
      expect(alphaResults.map((result) => result.id)).toEqual(['workspace-alpha'])
    })
  })

  describe('active session', () => {
    it('sets and gets active session', async () => {
      const mgr = createManager()

      await mgr.createSession({ id: 'active-1' })
      await mgr.createSession({ id: 'active-2' })

      const set = mgr.setActive('active-1')
      expect(set).toBeDefined()
      expect(set!.id).toBe('active-1')

      expect(mgr.active?.id).toBe('active-1')
    })

    it('returns undefined for unknown active', () => {
      const mgr = createManager()

      expect(mgr.active).toBeUndefined()
      expect(mgr.setActive('nonexistent')).toBeUndefined()
    })
  })

  describe('cwd propagation', () => {
    it('passes cwd from manager options to sessions', async () => {
      const mgr = createManager({ workspaceDir: '/test/workspace' })

      const session = await mgr.createSession({ id: 'cwd-test' })
      expect(session.workspaceDir).toBe('/test/workspace')
    })

    it('session-level cwd overrides manager cwd', async () => {
      const mgr = createManager({ workspaceDir: '/default/cwd' })

      const session = await mgr.createSession({ id: 'cwd-override', workspaceDir: '/override/cwd' })
      expect(session.workspaceDir).toBe('/override/cwd')
    })
  })

  describe('fork', () => {
    it('forks a session', async () => {
      const mgr = createManager()

      const original = await mgr.createSession({ id: 'source' })
      // Add a message to make the fork non-trivial
      original.session.append({
        ...makeUserTextMessage('hello'),
      })

      const forked = await mgr.forkSession('source', 'forked-1')

      expect(forked).toBeDefined()
      expect(forked!.id).toBe('forked-1')
      expect(mgr.listSessions()).toHaveLength(2)
    })

    it('returns undefined when forking nonexistent session', async () => {
      const mgr = createManager()

      const forked = await mgr.forkSession('ghost')
      expect(forked).toBeUndefined()
    })
  })

  describe('dispose', () => {
    it('disposes all sessions', async () => {
      const mgr = createManager()

      await mgr.createSession({ id: 'd1' })
      await mgr.createSession({ id: 'd2' })
      expect(mgr.listSessions()).toHaveLength(2)

      mgr.dispose()

      expect(mgr.listSessions()).toHaveLength(0)
    })
  })
})
