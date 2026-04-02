import { Hono } from 'hono'
import type { VitaminContext } from '@vitamin/coding'

export function createHealthRoute(_ctx: VitaminContext): Hono {
  const app = new Hono()

  app.get('/', (c) =>
    c.json({ status: 'ok', service: 'vitamin-coding' }),
  )

  return app
}
