import { describe, expect, it } from 'vitest'

import { createSessionManager } from '../src/session/session-manager'

describe('session_manager tool', () => {
  const signal = new AbortController().signal

  it('throws when sessionManager dependency is missing', async () => {
    const tool = createSessionManager({
      projectRoot: '/tmp',
    })

    await expect(tool.execute({
      id: 'sm0',
      params: { action: 'list' },
      signal,
    })).rejects.toThrow('SessionManager is not provided in options')
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

    await expect(tool.execute({
      id: 'sm4',
      params: { action: 'compact' },
      signal,
    })).rejects.toThrow('sessionId required for compact')
  })
})
