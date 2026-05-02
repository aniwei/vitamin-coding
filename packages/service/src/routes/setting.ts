import { Hono } from 'hono'
import { CodingService } from '../coding-service'

export function createSettingRoute(service: CodingService): Hono {
  const app = new Hono()

  app.get('/', (c) => {
    const active = service.getActiveSession()
    return c.json({
      workingDirectory: service.xMars.workspaceDir,
      model: active?.model?.id,
      modelProvider: active?.model?.provider,
    })
  })

  app.put('/', async (c) => {
    await c.req.json()
    return c.json({ status: 'ok', message: 'config updated' })
  })

  app.get('/providers', (c) => {
    const providerApis = service.xMars.providerRegistry.list()
    return c.json(
      providerApis.map((api) => ({
        id: api,
        name: api,
        models: [],
      })),
    )
  })

  app.post('/verify-model', async (c) => {
    const body = await c.req.json<{ provider: string; model: string }>()
    try {
      const model = service.xMars.modelRegistry.resolve(body.model)
      return c.json({ valid: !!model })
    } catch {
      return c.json({ valid: false, error: 'model not found' })
    }
  })

  app.post('/mode', async (c) => {
    const body = await c.req.json<{ mode: string }>()
    return c.json({ status: 'ok', message: `mode set to ${body.mode}` })
  })

  app.post('/autonomy', async (c) => {
    const body = await c.req.json<{ level: string }>()
    return c.json({ status: 'ok', message: `autonomy set to ${body.level}` })
  })

  app.post('/thinking', async (c) => {
    const body = await c.req.json<{ level: string }>()
    return c.json({ status: 'ok', message: `thinking set to ${body.level}` })
  })

  return app
}
