import { describe, expect, it, beforeEach } from 'vitest'
import { RemoteSessionPersistence, RemotePersistenceError } from '../src/remote-persistence'
import { createSessionStorage } from '../src/storage-factory'
import type { SessionSnapshot, PaginatedResult } from '../src/types'

function createFakeServer() {
  const store = new Map<string, SessionSnapshot<string>>()

  const fakeFetch: typeof globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url
    const method = init?.method ?? 'GET'
    const path = new URL(url).pathname

    if (method === 'PUT') {
      const body = JSON.parse(init?.body as string) as SessionSnapshot<string>
      store.set(body.id, body)
      return new Response(null, { status: 204 })
    }

    if (method === 'DELETE') {
      const id = decodeURIComponent(path.split('/').pop() ?? '')
      const deleted = store.delete(id)
      return new Response(null, { status: deleted ? 200 : 404 })
    }

    if (method === 'GET') {
      const urlObject = new URL(url)
      const segments = path
        .replace(/^\/sessions\/?/, '')
        .split('/')
        .filter(Boolean)

      if (segments.length === 0) {
        const pageParam = urlObject.searchParams.get('page')

        if (pageParam !== null) {
          const page = Number(pageParam)
          const pageSize = Number(urlObject.searchParams.get('pageSize') ?? 50)
          const ids = Array.from(store.keys())
          const total = ids.length
          const totalPages = Math.max(1, Math.ceil(total / pageSize))
          const safePage = Math.max(0, Math.min(page, totalPages - 1))
          const items = ids.slice(safePage * pageSize, safePage * pageSize + pageSize)
          const result: PaginatedResult<string> = {
            items,
            total,
            page: safePage,
            pageSize,
            totalPages,
            hasNext: safePage < totalPages - 1,
            hasPrevious: safePage > 0,
          }

          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        return new Response(JSON.stringify({ ids: Array.from(store.keys()) }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const id = decodeURIComponent(segments[0] ?? '')
      const snapshot = store.get(id)
      if (!snapshot) {
        return new Response(null, { status: 404 })
      }

      return new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(null, { status: 405 })
  }

  return { store, fakeFetch }
}

describe('RemoteSessionPersistence', () => {
  let server: ReturnType<typeof createFakeServer>
  let persistence: RemoteSessionPersistence<string>

  beforeEach(() => {
    server = createFakeServer()
    persistence = new RemoteSessionPersistence<string>({
      baseUrl: 'https://api.test.dev/sessions',
      getAuth: async () => ({ token: 'test-token' }),
      fetch: server.fakeFetch,
      timeoutMs: 1_000,
    })
  })

  describe('#when saving and loading', () => {
    it('#then round-trips a snapshot', async () => {
      const snap: SessionSnapshot<string> = {
        version: 1,
        id: 'remote-1',
        entries: [{ type: 'message', id: 'e1', message: 'hello', timestamp: 1000 }],
        metadata: {
          createdAt: 1000,
          lastActiveAt: 1000,
          messageCount: 1,
          compactionCount: 0,
          tags: [],
        },
        leafId: 'e1',
      }

      await persistence.save(snap)
      const loaded = await persistence.load('remote-1')

      expect(loaded).not.toBeNull()
      expect(loaded?.id).toBe('remote-1')
      expect(loaded?.entries).toHaveLength(1)
      expect(loaded?.leafId).toBe('e1')
    })
  })

  describe('#when loading nonexistent', () => {
    it('#then returns null', async () => {
      expect(await persistence.load('nonexistent')).toBeNull()
    })
  })

  describe('#when listing', () => {
    it('#then returns all saved ids', async () => {
      await persistence.save({
        version: 1,
        id: 'a',
        entries: [],
        metadata: { createdAt: 0, lastActiveAt: 0, messageCount: 0, compactionCount: 0, tags: [] },
      })
      await persistence.save({
        version: 1,
        id: 'b',
        entries: [],
        metadata: { createdAt: 0, lastActiveAt: 0, messageCount: 0, compactionCount: 0, tags: [] },
      })

      const ids = await persistence.list()
      expect(ids).toContain('a')
      expect(ids).toContain('b')
      expect(ids).toHaveLength(2)
    })
  })

  describe('#when paginating', () => {
    it('#then paginates result', async () => {
      for (let i = 0; i < 5; i++) {
        await persistence.save({
          version: 1,
          id: `s-${i}`,
          entries: [],
          metadata: {
            createdAt: 0,
            lastActiveAt: 0,
            messageCount: 0,
            compactionCount: 0,
            tags: [],
          },
        })
      }

      const page0 = await persistence.listPaginated({ page: 0, pageSize: 2 })
      expect(page0.items).toHaveLength(2)
      expect(page0.total).toBe(5)
      expect(page0.totalPages).toBe(3)
      expect(page0.hasNext).toBe(true)

      const page2 = await persistence.listPaginated({ page: 2, pageSize: 2 })
      expect(page2.items).toHaveLength(1)
      expect(page2.hasNext).toBe(false)
    })
  })

  describe('#when deleting', () => {
    it('#then removes snapshot', async () => {
      await persistence.save({
        version: 1,
        id: 'del',
        entries: [],
        metadata: { createdAt: 0, lastActiveAt: 0, messageCount: 0, compactionCount: 0, tags: [] },
      })

      expect(await persistence.delete('del')).toBe(true)
      expect(await persistence.load('del')).toBeNull()
    })

    it('#then returns false for nonexistent', async () => {
      expect(await persistence.delete('nope')).toBe(false)
    })
  })

  describe('#when server returns error', () => {
    it('#then throws RemotePersistenceError', async () => {
      const errorPersistence = new RemoteSessionPersistence<string>({
        baseUrl: 'https://api.test.dev/sessions',
        getAuth: async () => ({ token: 'test' }),
        fetch: async () => new Response(null, { status: 500, statusText: 'Internal Server Error' }),
        timeoutMs: 1_000,
      })

      await expect(errorPersistence.list()).rejects.toThrow(RemotePersistenceError)
      await expect(errorPersistence.list()).rejects.toThrow('500')
    })
  })

  describe('#when using createSessionStorage with remote type', () => {
    it('#then creates RemoteSessionPersistence', async () => {
      const storage = createSessionStorage<string>({
        type: 'remote',
        baseUrl: 'https://api.test.dev/sessions',
        getAuth: async () => ({ token: 'tok' }),
        fetch: server.fakeFetch,
      })

      await storage.save({
        version: 1,
        id: 'factory-remote',
        entries: [],
        metadata: { createdAt: 0, lastActiveAt: 0, messageCount: 0, compactionCount: 0, tags: [] },
      })
      expect(await storage.list()).toContain('factory-remote')
    })
  })

  describe('#when verifying request headers', () => {
    it('#then sends Authorization header on every request', async () => {
      const capturedHeaders: Record<string, string>[] = []
      const headerPersistence = new RemoteSessionPersistence<string>({
        baseUrl: 'https://api.test.dev/sessions',
        getAuth: async () => ({ token: 'my-secret-token' }),
        fetch: async (_input, init) => {
          const headers = init?.headers as Record<string, string> | undefined
          if (headers) {
            capturedHeaders.push({ ...headers })
          }

          return new Response(JSON.stringify({ ids: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        },
        timeoutMs: 1_000,
      })

      await headerPersistence.list()

      expect(capturedHeaders).toHaveLength(1)
      expect(capturedHeaders[0]?.Authorization).toBe('Bearer my-secret-token')
      expect(capturedHeaders[0]?.Accept).toBe('application/json')
    })

    it('#then sends Content-Type only on PUT', async () => {
      const capturedHeaders: Record<string, string>[] = []
      const headerPersistence = new RemoteSessionPersistence<string>({
        baseUrl: 'https://api.test.dev/sessions',
        getAuth: async () => ({ token: 'tok' }),
        fetch: async (_input, init) => {
          const headers = init?.headers as Record<string, string> | undefined
          if (headers) {
            capturedHeaders.push({ ...headers })
          }

          if (init?.method === 'GET') {
            return new Response(JSON.stringify({ ids: [] }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          }

          return new Response(null, { status: 204 })
        },
        timeoutMs: 1_000,
      })

      await headerPersistence.list()
      expect(capturedHeaders[0]?.['Content-Type']).toBeUndefined()

      await headerPersistence.save({
        version: 1,
        id: 'x',
        entries: [],
        metadata: { createdAt: 0, lastActiveAt: 0, messageCount: 0, compactionCount: 0, tags: [] },
      })
      expect(capturedHeaders[1]?.['Content-Type']).toBe('application/json')
    })
  })

  describe('#when baseUrl has trailing slash', () => {
    it('#then removes trailing slash before building URL', async () => {
      let capturedUrl = ''
      const persistenceWithSlash = new RemoteSessionPersistence<string>({
        baseUrl: 'https://api.test.dev/sessions/',
        getAuth: async () => ({ token: 'tok' }),
        fetch: async (input) => {
          capturedUrl = typeof input === 'string' ? input : (input as Request).url
          return new Response(JSON.stringify({ ids: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        },
        timeoutMs: 1_000,
      })

      await persistenceWithSlash.list()
      expect(capturedUrl).toBe('https://api.test.dev/sessions')
    })
  })

  describe('#when id contains special characters', () => {
    it('#then URL-encodes the id', async () => {
      let capturedUrl = ''
      const persistenceWithEncodedId = new RemoteSessionPersistence<string>({
        baseUrl: 'https://api.test.dev/sessions',
        getAuth: async () => ({ token: 'tok' }),
        fetch: async (input) => {
          capturedUrl = typeof input === 'string' ? input : (input as Request).url
          return new Response(
            JSON.stringify({
              version: 1,
              id: 'a/b',
              entries: [],
              metadata: {
                createdAt: 0,
                lastActiveAt: 0,
                messageCount: 0,
                compactionCount: 0,
                tags: [],
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        },
        timeoutMs: 1_000,
      })

      await persistenceWithEncodedId.load('a/b')
      expect(capturedUrl).toContain(encodeURIComponent('a/b'))
      expect(capturedUrl).not.toContain('/a/b')
    })
  })

  describe('#when RemotePersistenceError is thrown', () => {
    it('#then exposes statusCode property', async () => {
      const unavailablePersistence = new RemoteSessionPersistence<string>({
        baseUrl: 'https://api.test.dev/sessions',
        getAuth: async () => ({ token: 'tok' }),
        fetch: async () => new Response(null, { status: 503, statusText: 'Service Unavailable' }),
        timeoutMs: 1_000,
      })

      try {
        await unavailablePersistence.list()
        expect.unreachable('should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(RemotePersistenceError)
        expect((error as RemotePersistenceError).statusCode).toBe(503)
      }
    })
  })

  describe('#when delete returns 404', () => {
    it('#then returns false', async () => {
      const missingDeletePersistence = new RemoteSessionPersistence<string>({
        baseUrl: 'https://api.test.dev/sessions',
        getAuth: async () => ({ token: 'tok' }),
        fetch: async () => new Response(null, { status: 404 }),
        timeoutMs: 1_000,
      })

      expect(await missingDeletePersistence.delete('nonexistent')).toBe(false)
    })
  })
})
