import { describe, expect, it } from 'vitest'

import { createSessionManager } from '../src/session/session-manager'
import { createSessionSearch } from '../src/session/session-search'

describe('session_manager tool', () => {
  const signal = new AbortController().signal

  it('throws when sessionManager dependency is missing', async () => {
    const tool = createSessionManager({
      projectRoot: '/tmp',
    })

    await expect(
      tool.execute({
        id: 'sm0',
        params: { action: 'list' },
        signal,
      }),
    ).rejects.toThrow('SessionManager is not provided in options')
  })

  it('lists sessions', async () => {
    const tool = createSessionManager({
      projectRoot: '/tmp',
      sessionManager: {
        list: async () => [{ id: 's1', title: 'main', messageCount: 3 }],
        create: async () => ({ id: 'created' }),
        remove: async () => true,
        compact: async () => true,
      },
    })

    const result = await tool.execute({
      id: 'sm1',
      params: { action: 'list' },
      signal,
    })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('s1: main (3 messages)')
  })

  it('creates a session', async () => {
    const tool = createSessionManager({
      projectRoot: '/tmp',
      sessionManager: {
        list: async () => [],
        create: async (title) => ({ id: `new-${title ?? 'untitled'}` }),
        remove: async () => true,
        compact: async () => true,
      },
    })

    const result = await tool.execute({
      id: 'sm2',
      params: { action: 'create', title: 'demo' },
      signal,
    })

    expect(result.content[0]?.text).toContain('Session created: new-demo')
  })

  it('remove returns isError when target session does not exist', async () => {
    const tool = createSessionManager({
      projectRoot: '/tmp',
      sessionManager: {
        list: async () => [],
        create: async () => ({ id: 'x' }),
        remove: async () => false,
        compact: async () => true,
      },
    })

    const result = await tool.execute({
      id: 'sm3',
      params: { action: 'remove', sessionId: 'missing' },
      signal,
    })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('Session not found')
  })

  it('compact requires sessionId', async () => {
    const tool = createSessionManager({
      projectRoot: '/tmp',
      sessionManager: {
        list: async () => [],
        create: async () => ({ id: 'x' }),
        remove: async () => true,
        compact: async () => true,
      },
    })

    await expect(
      tool.execute({
        id: 'sm4',
        params: { action: 'compact' },
        signal,
      }),
    ).rejects.toThrow('sessionId required for compact')
  })
})

describe('session_search tool', () => {
  const signal = new AbortController().signal

  it('throws when search dependency is missing', async () => {
    const tool = createSessionSearch()

    await expect(
      tool.execute({
        id: 'ss0',
        params: { query: 'web_fetch' },
        signal,
      }),
    ).rejects.toThrow('SearchSessions dependency is not provided in options')
  })

  it('formats search results and returns structured details', async () => {
    const tool = createSessionSearch({
      searchSessions: async ({ query, limit }) => [
        {
          id: 's1',
          title: 'web tools',
          messageCount: 4,
          lastActiveAt: 123,
          score: 9,
          summary: `Matched ${query} with limit ${limit}`,
          matches: [{ role: 'user', text: 'web_fetch domain filter' }],
        },
      ],
    })

    const result = await tool.execute({
      id: 'ss1',
      params: { query: 'domain filter', limit: 3 },
      signal,
    })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('s1 — web tools')
    expect(result.content[0]?.text).toContain('user: web_fetch domain filter')
    expect(result.details?.results).toHaveLength(1)
    expect(result.details?.groups).toHaveLength(1)
  })

  it('groups related session search results by groupId', async () => {
    const tool = createSessionSearch({
      searchSessions: async () => [
        {
          id: 'root',
          title: 'migration root',
          messageCount: 5,
          lastActiveAt: 100,
          score: 10,
          groupId: 'root',
          matchedTerms: ['migration'],
          summary: 'Root migration planning',
          matches: [{ source: 'summary', text: 'migration planning' }],
        },
        {
          id: 'fork',
          title: 'migration fork',
          messageCount: 3,
          lastActiveAt: 120,
          score: 7,
          groupId: 'root',
          matchedTerms: ['migration', 'rollback'],
          summary: 'Fork rollback details',
          matches: [{ role: 'assistant', text: 'rollback details' }],
        },
        {
          id: 'other',
          messageCount: 2,
          lastActiveAt: 90,
          score: 4,
          groupId: 'other',
          summary: 'Separate result',
          matches: [{ role: 'user', text: 'migration elsewhere' }],
        },
      ],
    })

    const result = await tool.execute({
      id: 'ss-group',
      params: { query: 'migration' },
      signal,
    })

    expect(result.content[0]?.text).toContain('Group root')
    expect(result.content[0]?.text).toContain('2 sessions')
    expect(result.content[0]?.text).toContain('2 evidence')
    expect(result.content[0]?.text).toContain('Matched terms: migration, rollback')
    expect(result.content[0]?.text).toContain('root — migration root')
    expect(result.content[0]?.text).toContain('fork — migration fork')
    expect(result.details?.groups).toHaveLength(2)
    expect(result.details?.groups?.[0]).toMatchObject({
      groupId: 'root',
      score: 17,
      messageCount: 8,
      sessionCount: 2,
      evidenceCount: 2,
      matchedTerms: ['migration', 'rollback'],
    })
    expect(String(result.details?.groups?.[0]?.summary)).toContain('2 related sessions matched')
    expect(String(result.details?.groups?.[0]?.summary)).toContain('Evidence:')
  })

  it('allows host-provided focused summaries for grouped results', async () => {
    const tool = createSessionSearch({
      searchSessions: async () => [
        {
          id: 's1',
          messageCount: 4,
          lastActiveAt: 123,
          score: 9,
          groupId: 'g1',
          summary: 'Raw local summary',
          matches: [{ role: 'user', text: 'raw evidence' }],
        },
      ],
      summarizeGroups: async ({ query, groups }) =>
        groups.map((group) => ({
          ...group,
          summary: `Focused ${query}: ${group.sessions.map((session) => session.id).join(', ')}`,
        })),
    })

    const result = await tool.execute({
      id: 'ss-summarizer',
      params: { query: 'handoff' },
      signal,
    })

    expect(result.content[0]?.text).toContain('Focused handoff: s1')
    expect(result.details?.groups?.[0]?.summary).toBe('Focused handoff: s1')
  })

  it('returns a clear empty state', async () => {
    const tool = createSessionSearch({
      searchSessions: async () => [],
    })

    const result = await tool.execute({
      id: 'ss2',
      params: { query: 'missing' },
      signal,
    })

    expect(result.content[0]?.text).toContain('No sessions matched query: missing')
    expect(result.details?.results).toEqual([])
  })
})
