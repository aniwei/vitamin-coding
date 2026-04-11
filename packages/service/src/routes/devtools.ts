import { Hono } from 'hono'
import type { Devtools, BreakpointPoint } from '@vitamin/devtools'
import type { CodingService } from '../coding-service'

export function createDevtoolsRoute(context: CodingService, devtools: Devtools | null): Hono {
  const app = new Hono()

  app.get('/status', (c) => {
    return c.json({
      enabled: devtools !== null,
      connected: devtools !== null,
    })
  })

  app.use('/*', async (c, next) => {
    if (!devtools) {
      return c.json({ error: 'debugger not enabled' }, 503)
    }

    await next()
    return
  })

  app.get('/breakpoints', (c) => {
    const list = devtools?.debugger.listBreakpoints()
    return c.json({ breakpoints: list })
  })

  app.put('/breakpoints/:point', async (c) => {
    const point = c.req.param('point') as BreakpointPoint
    const { enabled } = await c.req.json<{ enabled: boolean }>()
    const result = devtools?.debugger.setBreakpoint(point, enabled)
    return c.json({ breakpoint: result })
  })

  app.post('/breakpoints/enable-all', (c) => {
    devtools?.debugger.enableAllBreakpoints()
    return c.json({ status: 'ok' })
  })

  app.post('/breakpoints/disable-all', (c) => {
    devtools?.debugger.disableAllBreakpoints()
    return c.json({ status: 'ok' })
  })

  return app
}
