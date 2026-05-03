import { describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'

import { createApp } from '../src/create-app'
import type { CodingService } from '../src/coding-service'

function createTestService() {
  const prompt = vi.fn(async () => undefined)
  let sessionSink: ((message: unknown) => void) | undefined
  const sessions = new Map<string, { id: string; prompt: typeof prompt }>()
  const service = {
    getSession: vi.fn((id: string) => sessions.get(id)),
    xMars: {
      createSession: vi.fn(async ({ id }: { id: string }) => {
        const session = { id, prompt }
        sessions.set(id, session)
        return session
      }),
    },
    ws: {
      sendToSession: vi.fn(),
      subscribeSessionEvents: vi.fn((_sessionId: string, sink: (message: unknown) => void) => {
        sessionSink = sink
        return vi.fn()
      }),
    },
  } as unknown as CodingService

  return {
    service,
    prompt,
    sessions,
    emitSessionEvent: (message: unknown) => sessionSink?.(message),
  }
}

describe('gateway route', () => {
  it('accepts webhook messages and creates isolated channel sessions', async () => {
    const { service, prompt } = createTestService()
    const app = createApp(service)

    const response = await app.request('/api/gateway/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channel: 'slack',
        threadId: 'thread-1',
        userId: 'user-1',
        metadata: { team: 'eng', traceId: 'trace-1' },
        message: 'run the scheduled report',
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      status: 'ok',
      sessionId: 'gateway:slack:thread-1',
      channel: 'slack',
    })
    expect(service.ws.sendToSession).toHaveBeenCalledWith(
      'gateway:slack:thread-1',
      expect.objectContaining({
        type: 'Gateway.messageReceived',
        data: expect.objectContaining({
          source: 'webhook',
          sessionId: 'gateway:slack:thread-1',
          channel: 'slack',
          threadId: 'thread-1',
          userId: 'user-1',
          metadataKeys: ['team', 'traceId'],
        }),
      }),
    )
    expect(prompt).toHaveBeenCalledWith('run the scheduled report')
  })

  it('requires webhook secret when configured', async () => {
    const { service } = createTestService()
    const app = createApp(service, { gateway: { webhookSecret: 'secret' } })

    const missing = await app.request('/api/gateway/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    })
    const accepted = await app.request('/api/gateway/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer secret',
      },
      body: JSON.stringify({ message: 'hello' }),
    })

    expect(missing.status).toBe(401)
    expect(accepted.status).toBe(200)
  })

  it('delivers gateway session events to an outbound webhook', async () => {
    const { service, emitSessionEvent } = createTestService()
    const deliveryFetch = vi.fn(async () => new Response('ok', { status: 200 }))
    const app = createApp(service, {
      gateway: {
        deliveryUrl: 'https://hooks.example.test/x-mars',
        deliverySecret: 'deliver-secret',
        deliveryFetch,
      },
    })

    const response = await app.request('/api/gateway/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channel: 'slack',
        threadId: 'thread-1',
        message: 'hello',
      }),
    })
    expect(response.status).toBe(200)

    emitSessionEvent({
      type: 'Chat.messageComplete',
      data: { sessionId: 'gateway:slack:thread-1' },
    })
    await vi.waitFor(() => expect(deliveryFetch).toHaveBeenCalledTimes(1))

    expect(deliveryFetch).toHaveBeenCalledWith(
      'https://hooks.example.test/x-mars',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer deliver-secret',
        },
        body: JSON.stringify({
          channel: 'slack',
          sessionId: 'gateway:slack:thread-1',
          event: {
            type: 'Chat.messageComplete',
            data: { sessionId: 'gateway:slack:thread-1' },
          },
        }),
      }),
    )
  })

  it('retries and signs outbound deliveries', async () => {
    const { service, emitSessionEvent } = createTestService()
    const deliveryFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('failed', { status: 500 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const app = createApp(service, {
      gateway: {
        deliveryUrl: 'https://hooks.example.test/x-mars',
        deliverySigningSecret: 'signing-secret',
        deliveryRetries: 1,
        deliveryFetch,
      },
    })

    const response = await app.request('/api/gateway/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channel: 'slack',
        threadId: 'thread-1',
        message: 'hello',
      }),
    })
    expect(response.status).toBe(200)

    emitSessionEvent({
      type: 'Chat.messageComplete',
      data: { sessionId: 'gateway:slack:thread-1' },
    })
    await vi.waitFor(() => expect(deliveryFetch).toHaveBeenCalledTimes(2))

    const init = deliveryFetch.mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Record<string, string>
    const body = init.body as string
    const timestamp = headers['x-x-mars-delivery-timestamp']

    expect(headers['x-x-mars-delivery-id']).toEqual(expect.any(String))
    expect(timestamp).toEqual(expect.any(String))
    expect(headers['x-x-mars-delivery-signature']).toBe(
      `sha256=${createHmac('sha256', 'signing-secret')
        .update(`${timestamp}.${body}`)
        .digest('hex')}`,
    )
    expect(deliveryFetch.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers,
      body,
    })
  })
})
