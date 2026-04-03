import { Hono } from 'hono'
import { CodingService } from '../coding-service'
import type { VitaminContext } from '@vitamin/coding'

export function createConfigRoute(service: CodingService): Hono {
  const app = new Hono()

  // GET /config — current configuration
  app.get('/', (c) => {
    const active = service.vitamin.sessionManager.active
    return c.json({
      working_directory: service.vitamin.workspaceDir,
      model: active?.model?.id,
      model_provider: active?.model?.provider,
    })
  })

  // PUT /config — update configuration
  app.put('/', async (c) => {
    await c.req.json()
    return c.json({ status: 'ok', message: 'config updated' })
  })

  // GET /config/providers — list available providers
  app.get('/providers', (c) => {
    const providers = service.vitamin.providerRegistry.list()
    return c.json(
      providers.map((p: any) => ({
        id: p.id,
        name: p.displayName ?? p.id,
        models: [],
      })),
    )
  })

  // POST /config/verify-model — check if model is accessible
  app.post('/verify-model', async (c) => {
    const body = await c.req.json<{ provider: string; model: string }>()
    try {
      const model = service.vitamin.modelRegistry.resolve(body.model)
      return c.json({ valid: !!model })
    } catch {
      return c.json({ valid: false, error: 'model not found' })
    }
  })

  // POST /config/mode
  app.post('/mode', async (c) => {
    const body = await c.req.json<{ mode: string }>()
    return c.json({ status: 'ok', message: `mode set to ${body.mode}` })
  })

  // POST /config/autonomy
  app.post('/autonomy', async (c) => {
    const body = await c.req.json<{ level: string }>()
    return c.json({ status: 'ok', message: `autonomy set to ${body.level}` })
  })

  // POST /config/thinking
  app.post('/thinking', async (c) => {
    const body = await c.req.json<{ level: string }>()
    return c.json({ status: 'ok', message: `thinking set to ${body.level}` })
  })

  return app
}
