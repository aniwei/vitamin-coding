import { Hono } from 'hono'
import type { Devtools } from '../types'

export const createLoggerRoute = (devtools: Devtools) => {
  const app = new Hono()

  return app
}