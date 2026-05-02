import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/create-app'
import type { CodingService } from '../src/coding-service'

describe('events route', () => {
  it('returns 404 for missing session streams', async () => {
    const app = createApp({
      getSession: () => undefined,
      ws: {
        subscribeSessionEvents: vi.fn(),
      },
    } as unknown as CodingService)

    const response = await app.request('/api/events/sessions/missing/ndjson')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Session "missing" not found' })
  })

  it('opens ndjson stream for existing sessions', async () => {
    const app = createApp({
      getSession: (id: string) => (id === 's1' ? { id: 's1' } : undefined),
      ws: {
        subscribeSessionEvents: vi.fn(() => () => {}),
      },
    } as unknown as CodingService)

    const response = await app.request('/api/events/sessions/s1/ndjson')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/x-ndjson')
  })
})
