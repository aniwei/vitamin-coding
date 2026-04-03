import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createHealthRoute } from './routes/health'
import { createChatRoute } from './routes/chat'
import { createSessionsRoute } from './routes/sessions'
import { createConfigRoute } from './routes/setting'
import { createDebugRoute } from './routes/debug'
import { createLogRoute } from './routes/logs'
import type { Devtools } from '@vitamin/devtools'
import type { CodingService } from './coding-service'
import type { DebugBridge } from './debug-bridge'

interface AppOptions {
  cors?: string
  devtools?: Devtools
  staticDir?: string
  debugBridge?: DebugBridge | null
}

export function createApp(context: CodingService, options: AppOptions = {}): Hono {
  const app = new Hono()

  if (options.cors) {
    app.use('/api/*', cors({
      origin: options.cors,
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    }))
  }

  app.route('/api/health', createHealthRoute(context))
  app.route('/api/chat', createChatRoute(context))
  app.route('/api/sessions', createSessionsRoute(context))
  app.route('/api/config', createConfigRoute(context))
  app.route('/api/debug', createDebugRoute(options.devtools ?? null))
  app.route('/api/logs', createLogRoute(options.debugBridge ?? null))

  if (options.staticDir) {
    app.get('*', c => context.static(c))
  }

  app.notFound((c) => c.text('not found', 404))

  return app
}