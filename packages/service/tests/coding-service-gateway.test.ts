import { afterEach, describe, expect, it, vi } from 'vitest'

import { createCodingService } from '../src/coding-service'
import type { CodingService } from '../src/coding-service'
import type { CodingServiceOptions } from '../src/types'

function createServiceWithGatewaySetting(
  gatewaySetting: Record<string, unknown> | undefined,
  options: Partial<CodingServiceOptions> = {},
): {
  service: CodingService
  prompt: ReturnType<typeof vi.fn>
  request: (path: string, init?: RequestInit) => Promise<Response>
} {
  const prompt = vi.fn(async () => undefined)
  const sessions = new Map<string, { id: string; prompt: typeof prompt }>()
  const context = {
    devtools: null,
    settings: {
      get: vi.fn((key: string) => (key === 'gateway' ? gatewaySetting : undefined)),
    },
    hookRegistry: {
      registerAll: vi.fn(),
      unregister: vi.fn(),
    },
    getSession: vi.fn((id: string) => sessions.get(id)),
    getActiveSession: vi.fn(),
    createSession: vi.fn(async ({ id }: { id: string }) => {
      const session = { id, prompt }
      sessions.set(id, session)
      return session
    }),
  } as never

  const service = createCodingService(context, {
    port: 0,
    ...options,
  })
  const app = (service as unknown as { app: { request: typeof fetch } }).app

  return {
    service,
    prompt,
    request: (path, init) => app.request(path, init),
  }
}

describe('CodingService gateway settings', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads gateway webhook secret from settings', async () => {
    const { service, prompt, request } = createServiceWithGatewaySetting({
      webhook_secret: 'setting-secret',
    })

    try {
      const missing = await request('/api/gateway/webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'hello' }),
      })
      const accepted = await request('/api/gateway/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer setting-secret',
        },
        body: JSON.stringify({ message: 'hello' }),
      })

      expect(missing.status).toBe(401)
      expect(accepted.status).toBe(200)
      expect(prompt).toHaveBeenCalledWith('hello')
    } finally {
      service.ws.close()
    }
  })

  it('lets explicit gateway options override settings', async () => {
    const { service, request } = createServiceWithGatewaySetting(
      { webhookSecret: 'setting-secret' },
      { gateway: { webhookSecret: 'option-secret' } },
    )

    try {
      const settingSecret = await request('/api/gateway/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer setting-secret',
        },
        body: JSON.stringify({ message: 'hello' }),
      })
      const optionSecret = await request('/api/gateway/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer option-secret',
        },
        body: JSON.stringify({ message: 'hello' }),
      })

      expect(settingSecret.status).toBe(401)
      expect(optionSecret.status).toBe(200)
    } finally {
      service.ws.close()
    }
  })

  it('can disable the gateway route from settings', async () => {
    const { service, request } = createServiceWithGatewaySetting({ enabled: false })

    try {
      const response = await request('/api/gateway/webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'hello' }),
      })

      expect(response.status).toBe(404)
    } finally {
      service.ws.close()
    }
  })
})
