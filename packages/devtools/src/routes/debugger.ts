import { Hono } from 'hono'
import type { DevtoolsService } from '../service'

export const createDebuggerRoute = (service: DevtoolsService) => {
  const app = new Hono()

  app.get('/paused', async c => {
    service.broadcast(await c.req.text())
    return new Promise<Response>((resolve) => {
      service.once('Debugger.stepOver', () => {
        resolve(c.text('ok'))
      })
    })
  })

  return app
}

