import { Hono } from 'hono'
import { type ServiceWorkerServer } from '../service-worker'

export const createSessionRoute = (_service: ServiceWorkerServer) => {
  const app = new Hono()
  return app
}
