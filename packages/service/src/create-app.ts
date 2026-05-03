import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createHealthRoute } from './routes/health'
import { createChatRoute } from './routes/chat'
import { createSessionsRoute } from './routes/sessions'
import { createSettingRoute } from './routes/setting'
import { createDevtoolsRoute } from './routes/devtools'
import { createLoggerRoute } from './routes/logs'
import { createWorkspaceRoute } from './routes/workspace'
import { createEventsRoute } from './routes/events'
import { createGatewayRoute } from './routes/gateway'
import type { Devtools } from '@x-mars/devtools'
import type { CodingService } from './coding-service'
import type { DebugBridge } from './debug-bridge'
import type { CodingServiceOptions } from './types'

interface AppOptions {
  corsOrigin?: string
  devtools?: Devtools
  staticDir?: string
  debug?: DebugBridge | null
  gateway?: CodingServiceOptions['gateway']
}

export function createApp(context: CodingService, options: AppOptions = {}): Hono {
  const app = new Hono()

  if (options.corsOrigin) {
    app.use(
      '/api/*',
      cors({
        origin: options.corsOrigin,
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      }),
    )
  }

  app.route('/api/health', createHealthRoute(context))
  app.route('/api/chat', createChatRoute(context))
  app.route('/api/sessions', createSessionsRoute(context))
  app.route('/api/sessions', createWorkspaceRoute(context))
  app.route('/api/setting', createSettingRoute(context))
  app.route('/api/devtools', createDevtoolsRoute(context, options.devtools || null))
  app.route('/api/logs', createLoggerRoute(context))
  app.route('/api/events', createEventsRoute(context))
  if (options.gateway?.enabled !== false) {
    app.route('/api/gateway', createGatewayRoute(context, options.gateway))
  }

  if (options.staticDir) {
    app.get('*', (c) => {
      return context.static(c)
    })
  }

  app.notFound((c) => {
    return c.text('not found', 404)
  })

  return app
}
