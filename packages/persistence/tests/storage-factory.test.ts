import { describe, expect, it } from 'vitest'
import { createPersistence } from '../src/storage-factory'
import { MemoryPersistence } from '../src/memory-persistence'
import { FilePersistence } from '../src/file-persistence'
import { HttpPersistence } from '../src/http-persistence'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Snapshot } from '../src/types'

describe('createPersistence', () => {
  it('creates MemoryPersistence for type "memory"', () => {
    const p = createPersistence({ type: 'memory' })
    expect(p).toBeInstanceOf(MemoryPersistence)
  })

  it('creates FilePersistence for type "file"', () => {
    const p = createPersistence({ type: 'file', baseDir: '/tmp/test' })
    expect(p).toBeInstanceOf(FilePersistence)
  })

  it('creates HttpPersistence for type "http"', () => {
    const p = createPersistence({
      type: 'http',
      baseUrl: 'https://example.com/api',
      getAuth: async () => ({ token: 'test' }),
      fetch: globalThis.fetch,
    })
    expect(p).toBeInstanceOf(HttpPersistence)
  })

  it('passes custom codec into disk persistence', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'vitamin-persistence-factory-'))
    const codec = {
      encode(snapshot: Snapshot<string>): string {
        return `FACTORY:${JSON.stringify(snapshot)}`
      },
      decode(payload: string): Snapshot<string> {
        return JSON.parse(payload.replace(/^FACTORY:/, '')) as Snapshot<string>
      },
    }

    try {
      const p = createPersistence<string>({
        type: 'file',
        baseDir: tempDir,
        extension: '.snap',
        codec,
      })

      await p.save({
        version: 1,
        id: 's1',
        data: 'hello',
        metadata: { createdAt: 1, updatedAt: 1, tags: [] },
      })

      const raw = await readFile(join(tempDir, 's1.snap'), 'utf-8')
      expect(raw.startsWith('FACTORY:')).toBe(true)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('passes custom headers into remote persistence', async () => {
    const requests: Array<{ headers: Record<string, string> }> = []
    const p = createPersistence<string>({
      type: 'http',
      baseUrl: 'https://example.com/api',
      getAuth: async () => ({ token: 'abc' }),
      getHeaders: async () => ({ 'X-Team': 'vitamin' }),
      fetch: (async (_input: string | URL | Request, init?: RequestInit) => {
        requests.push({ headers: Object.fromEntries(Object.entries(init?.headers ?? {})) as Record<string, string> })
        return new Response(JSON.stringify({ ids: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }) as typeof globalThis.fetch,
    })

    await p.list()
    expect(requests[0]!.headers['X-Team']).toBe('vitamin')
    expect(requests[0]!.headers['Authorization']).toBe('Bearer abc')
  })

  it('throws for unknown storage type', () => {
    expect(() =>
      createPersistence({ type: 'unknown' as any } as any),
    ).toThrow('Unsupported storage type')
  })
})
