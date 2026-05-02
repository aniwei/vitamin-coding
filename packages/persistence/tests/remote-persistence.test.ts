import { describe, expect, it } from 'vitest'
import { RemotePersistence } from '../src/remote-persistence'
import { RemotePersistenceError } from '../src/errors'
import type { PaginatedResult, Snapshot } from '../src/types'

class TestRemotePersistence<T> extends RemotePersistence<Snapshot<T>> {
  protected extractId(snapshot: Snapshot<T>): string {
    return snapshot.id
  }
}

function makeSnapshot(id: string, data: string): Snapshot<string> {
  const now = Date.now()
  return {
    version: 1,
    id,
    data,
    metadata: {
      createdAt: now,
      updatedAt: now,
      tags: [],
    },
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Internal Server Error',
    headers: { 'Content-Type': 'application/json' },
  })
}

interface CapturedRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
}

function createTestPersistence(options?: {
  handler?: (url: string, init: RequestInit) => Response | Promise<Response>
  token?: string
  timeoutMs?: number
  getHeaders?: () => Promise<Record<string, string>>
}): { persistence: TestRemotePersistence<string>; captured: CapturedRequest[] } {
  const captured: CapturedRequest[] = []
  const handler = options?.handler ?? (() => jsonResponse({}))
  const token = options?.token ?? 'test-token'

  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const method = init?.method ?? 'GET'
    const headers = Object.fromEntries(Object.entries(init?.headers ?? {})) as Record<string, string>
    const body = init?.body ? String(init.body) : null

    captured.push({ url, method, headers, body })
    return handler(url, init ?? {})
  }) as typeof globalThis.fetch

  const persistence = new TestRemotePersistence<string>({
    baseUrl: 'https://api.test.com/snapshots',
    getAuth: async () => ({ token }),
    getHeaders: options?.getHeaders,
    fetch: fakeFetch,
    timeoutMs: options?.timeoutMs ?? 5000,
  })

  return { persistence, captured }
}

describe('RemotePersistence', () => {
  it('sends PUT with snapshot JSON payload', async () => {
    const { persistence, captured } = createTestPersistence()
    const snapshot = makeSnapshot('s1', 'hello')

    await persistence.save(snapshot)

    expect(captured).toHaveLength(1)
    expect(captured[0]!.method).toBe('PUT')
    expect(captured[0]!.url).toBe('https://api.test.com/snapshots/s1')
    expect(captured[0]!.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(captured[0]!.body!)).toEqual(snapshot)
  })

  it('loads snapshot on 200 and returns null on 404', async () => {
    const snapshot = makeSnapshot('s1', 'hello')
    const ok = createTestPersistence({ handler: () => jsonResponse(snapshot) }).persistence
    const notFound = createTestPersistence({ handler: () => jsonResponse({}, 404) }).persistence

    expect(await ok.load('s1')).toEqual(snapshot)
    expect(await notFound.load('missing')).toBeNull()
  })

  it('deletes snapshots and handles 404', async () => {
    const ok = createTestPersistence({ handler: () => jsonResponse({}, 200) }).persistence
    const missing = createTestPersistence({ handler: () => jsonResponse({}, 404) }).persistence

    expect(await ok.delete('s1')).toBe(true)
    expect(await missing.delete('missing')).toBe(false)
  })

  it('lists ids and paginated ids', async () => {
    const paginatedResult: PaginatedResult<string> = {
      items: ['a'],
      total: 1,
      page: 0,
      pageSize: 10,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    }

    const list = createTestPersistence({ handler: () => jsonResponse({ ids: ['a', 'b'] }) }).persistence
    const { persistence, captured } = createTestPersistence({ handler: () => jsonResponse(paginatedResult) })

    expect(await list.list()).toEqual(['a', 'b'])

    const result = await persistence.listPaginated({ page: 0, pageSize: 10, sortBy: 'createdAt', order: 'asc' })
    expect(result).toEqual(paginatedResult)
    expect(captured[0]!.url).toContain('page=0')
    expect(captured[0]!.url).toContain('pageSize=10')
    expect(captured[0]!.url).toContain('sortBy=createdAt')
    expect(captured[0]!.url).toContain('order=asc')
  })

  it('adds bearer auth and merges custom headers', async () => {
    const { persistence, captured } = createTestPersistence({
      handler: () => jsonResponse({ ids: [] }),
      token: 'secret-token',
      getHeaders: async () => ({ 'X-Team': 'xMars' }),
    })

    await persistence.list()

    expect(captured[0]!.headers['Authorization']).toBe('Bearer secret-token')
    expect(captured[0]!.headers['X-Team']).toBe('xMars')
    expect(captured[0]!.headers['Accept']).toBe('application/json')
  })

  it('uses custom codec content-type and payload transform', async () => {
    const codec = {
      encode(snapshot: Snapshot<string>): string {
        return `MARKDOWN:${snapshot.id}:${snapshot.data}`
      },
      decode(payload: string): Snapshot<string> {
        const parts = payload.split(':')
        return {
          version: 1,
          id: parts[1]!,
          data: parts.slice(2).join(':'),
          metadata: { createdAt: 1, updatedAt: 1, tags: [] },
        }
      },
      contentType: 'text/markdown',
    }

    const captured: CapturedRequest[] = []
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      captured.push({
        url,
        method: init?.method ?? 'GET',
        headers: Object.fromEntries(Object.entries(init?.headers ?? {})) as Record<string, string>,
        body: init?.body ? String(init.body) : null,
      })

      if ((init?.method ?? 'GET') === 'GET') {
        return new Response('MARKDOWN:s1:hello', {
          status: 200,
          headers: { 'Content-Type': 'text/markdown' },
        })
      }

      return new Response('', { status: 200 })
    }) as typeof globalThis.fetch

    const persistence = new TestRemotePersistence<string>({
      baseUrl: 'https://api.test.com/snapshots',
      getAuth: async () => ({ token: 'token' }),
      fetch: fakeFetch,
      timeoutMs: 5000,
      codec,
    })

    await persistence.save(makeSnapshot('s1', 'hello'))
    expect(captured[0]!.headers['Content-Type']).toBe('text/markdown')
    expect(captured[0]!.body).toBe('MARKDOWN:s1:hello')

    const loaded = await persistence.load('s1')
    expect(loaded).not.toBeNull()
    expect(loaded!.id).toBe('s1')
    expect(loaded!.data).toBe('hello')
  })

  it('throws RemotePersistenceError on non-404 errors', async () => {
    const failing = createTestPersistence({
      handler: () => new Response('Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    }).persistence

    await expect(failing.list()).rejects.toThrow(RemotePersistenceError)
  })
})
