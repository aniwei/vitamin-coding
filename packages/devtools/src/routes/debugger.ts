import { Hono } from 'hono'
import type { ServiceWorkerServer } from '../service-worker'

export const createDebuggerRoute = (_server: ServiceWorkerServer) => {
  const app = new Hono()

  return app
}

