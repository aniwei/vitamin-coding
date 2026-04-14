import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { CodingService } from '../coding-service'

const LOG_LEVEL_SEVERITY: Record<string, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
}

export function createLoggerRoute(context: CodingService): Hono {
  const app = new Hono()

  app.get('/history', (c) => {
    if (!context.bridge) {
      return c.json({ entries: [], total: 0 })
    }

    const limit = Math.min(Number(c.req.query('limit') ?? 100), 2000)
    const level = c.req.query('level')
    const module = c.req.query('module')

    let entries = context.bridge.getLogs()
    if (level && LOG_LEVEL_SEVERITY[level] !== undefined) {
      const minSeverity = LOG_LEVEL_SEVERITY[level]
      entries = entries.filter((e) => (LOG_LEVEL_SEVERITY[e.level] ?? 0) >= minSeverity)
    }
    if (module) {
      entries = entries.filter((e) => e.module.includes(module))
    }
    const total = entries.length
    entries = entries.slice(-limit)

    return c.json({ entries, total })
  })

  app.get('/stream', (c) => {
    // TODO
    if (!context.bridge) {
      return c.text('debugger not enabled', 503)
    }

    return streamSSE(c, async (stream) => {
      const unsubscribe = context.bridge?.on('log', (entry) => {
        stream.writeSSE({ event: 'log', data: JSON.stringify(entry) })
      })

      stream.onAbort(() => unsubscribe?.())
    })
  })

  return app
}
