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
