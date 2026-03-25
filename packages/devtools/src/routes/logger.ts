import { Hono } from 'hono'
import { type DevtoolsService } from '../service'

export const createLoggerRoute = (service: DevtoolsService) => {
  const app = new Hono()

  app.post('/', async c => {
    service.broadcast(await c.req.text())
    return c.text('ok')
  })

  return app
}