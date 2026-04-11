import { Hono } from 'hono'
import type { CodingService } from '../coding-service'

export function createHealthRoute(_context: CodingService): Hono {
  const app = new Hono()

  app.get('/', (c) => c.json({ status: 'ok', service: 'vitamin-coding' }))

  return app
}
