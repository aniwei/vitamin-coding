import { Hono } from 'hono'
import { createHmac, randomUUID } from 'node:crypto'
import { createLogger } from '@x-mars/shared'

import type { CodingService } from '../coding-service'
import type { GatewayMessageReceivedData, GatewayWebhookBody, WebSocketMessage } from '../types'

const logger = createLogger('@x-mars/service:gateway')

export interface GatewayRouteOptions {
  enabled?: boolean
  webhookSecret?: string
  deliveryUrl?: string
  deliverySecret?: string
  deliverySigningSecret?: string
  deliveryRetries?: number
  deliveryFetch?: typeof fetch
}

export function createGatewayRoute(
  service: CodingService,
  options: GatewayRouteOptions = {},
): Hono {
  const app = new Hono()
  const deliveries = new Map<string, () => void>()

  app.post('/webhook', async (c) => {
    if (options.webhookSecret && !isAuthorized(c.req.raw.headers, options.webhookSecret)) {
      logger.warn({ source: 'webhook' }, 'gateway webhook unauthorized')
      return c.json({ status: 'error', message: 'unauthorized' }, 401)
    }

    const body = await c.req.json<GatewayWebhookBody>().catch(() => null)
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    if (!message) {
      return c.json({ status: 'error', message: 'message is required' }, 400)
    }

    const sessionId = resolveGatewaySessionId(body)
    const session =
      service.getSession(sessionId) ?? (await service.xMars.createSession({ id: sessionId }))
    const channel = sanitizeSegment(body?.channel) || 'webhook'
    const deliverySubscribed = ensureDeliverySubscription(
      service,
      options,
      deliveries,
      session.id,
      channel,
    )
    const audit = createGatewayAuditRecord(body, session.id, channel)
    logger.info(
      {
        eventId: audit.eventId,
        sessionId: audit.sessionId,
        channel: audit.channel,
        userId: audit.userId,
        threadId: audit.threadId,
        metadataKeys: audit.metadataKeys,
      },
      'gateway webhook accepted',
    )
    service.ws.sendToSession(session.id, {
      type: 'Gateway.messageReceived',
      data: audit,
    })

    session.prompt(message).catch((err: Error) => {
      service.ws.sendToSession(session.id, {
        type: 'Runtime.error',
        data: { sessionId: session.id, message: err.message },
      })
    })

    return c.json({
      status: 'ok',
      message: 'webhook accepted',
      sessionId: session.id,
      channel,
      gatewayEventId: audit.eventId,
      delivery: options.deliveryUrl ? { subscribed: deliverySubscribed } : undefined,
    })
  })

  return app
}

function ensureDeliverySubscription(
  service: CodingService,
  options: GatewayRouteOptions,
  deliveries: Map<string, () => void>,
  sessionId: string,
  channel: string,
): boolean {
  if (!options.deliveryUrl) {
    return false
  }
  if (deliveries.has(sessionId)) {
    return true
  }

  const unsubscribe = service.ws.subscribeSessionEvents(sessionId, (event) => {
    void deliverEvent(options, { channel, sessionId, event })
  })
  deliveries.set(sessionId, unsubscribe)
  return true
}

async function deliverEvent(
  options: GatewayRouteOptions,
  payload: { channel: string; sessionId: string; event: WebSocketMessage },
): Promise<void> {
  if (!options.deliveryUrl) {
    return
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.deliverySecret) {
    headers.authorization = `Bearer ${options.deliverySecret}`
  }
  const body = JSON.stringify(payload)
  if (options.deliverySigningSecret) {
    const timestamp = new Date().toISOString()
    headers['x-x-mars-delivery-id'] = randomUUID()
    headers['x-x-mars-delivery-timestamp'] = timestamp
    headers['x-x-mars-delivery-signature'] = signDeliveryPayload(
      options.deliverySigningSecret,
      timestamp,
      body,
    )
  }

  const fetchImpl = options.deliveryFetch ?? globalThis.fetch
  const attempts = getDeliveryAttempts(options.deliveryRetries)
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(options.deliveryUrl, {
        method: 'POST',
        headers,
        body,
      })
      if (response.ok) {
        return
      }
      logger.warn(
        { status: response.status, sessionId: payload.sessionId, attempt, attempts },
        'gateway delivery failed',
      )
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId: payload.sessionId,
          attempt,
          attempts,
        },
        'gateway delivery failed',
      )
    }
  }
}

function getDeliveryAttempts(retries: number | undefined): number {
  const retryCount =
    typeof retries === 'number' && Number.isFinite(retries)
      ? Math.max(0, Math.min(5, Math.floor(retries)))
      : 2
  return retryCount + 1
}

function signDeliveryPayload(secret: string, timestamp: string, body: string): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  return `sha256=${digest}`
}

function isAuthorized(headers: Headers, secret: string): boolean {
  const authorization = headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : ''
  return token === secret || headers.get('x-x-mars-webhook-secret') === secret
}

function resolveGatewaySessionId(body: GatewayWebhookBody | null): string {
  const explicit = sanitizeSegment(body?.sessionId)
  if (explicit) {
    return explicit
  }

  const channel = sanitizeSegment(body?.channel) || 'webhook'
  const thread = sanitizeSegment(body?.threadId) || sanitizeSegment(body?.userId) || 'default'
  return `gateway:${channel}:${thread}`
}

function createGatewayAuditRecord(
  body: GatewayWebhookBody | null,
  sessionId: string,
  channel: string,
): GatewayMessageReceivedData {
  const metadataKeys =
    body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? Object.keys(body.metadata).sort()
      : undefined

  return {
    eventId: randomUUID(),
    source: 'webhook',
    sessionId,
    channel,
    userId: sanitizeSegment(body?.userId),
    threadId: sanitizeSegment(body?.threadId),
    metadataKeys: metadataKeys && metadataKeys.length > 0 ? metadataKeys : undefined,
    timestamp: new Date().toISOString(),
  }
}

function sanitizeSegment(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]+/g, '-')
    .slice(0, 120)
  return cleaned.length > 0 ? cleaned : undefined
}
