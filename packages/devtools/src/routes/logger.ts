import { Hono } from 'hono'
import { type ServiceWorkerServer } from '../service-worker'

export const createLoggerRoute = (service: ServiceWorkerServer) => {
  const app = new Hono()

  app.post('/', async c => {
    service.broadcast(await c.req.text())
    return c.text('ok')
  })

  return app
}