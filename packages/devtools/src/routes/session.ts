import { Hono } from 'hono'
import type { DevtoolsService } from '../service'

export const createSessionRoute = (devtools: DevtoolsService) => {
  const app = new Hono()

  return app
}
