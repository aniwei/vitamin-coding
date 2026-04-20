import { authRoutes } from './auth.routes'
import { chatRoutes } from './chat.routes'
import { agent } from './agent.routes'
import { workflowRoutes } from './workflow.routes'
import { mcpRoutes } from './mcp.routes'
import { archiveRoutes } from './archive.routes'
import { exportRoutes } from './export.routes'
import { storageRoutes } from './storage.routes'
import { userRoutes } from './user.routes'
import { adminRoutes } from './admin.routes'
import { bookmarkRoutes } from './bookmark.routes'
import { threadRoutes } from './thread.routes'
import type { Hono } from 'hono'
import type { AppEnv } from '../app'

/**
 * 挂载所有业务路由，对应原 Next.js App Router 的 /api/** 目录。
 */
export function mount(app: Hono<AppEnv>) {
  app.get('/api/ping', (c) => c.json({ ok: true, ts: Date.now() }))

  // Auth（better-auth Web handler，捕获所有 /api/auth/** 请求）
  app.route('/api/auth', authRoutes)

  // 核心业务路由
  app.route('/api/chat', chatRoutes)
  app.route('/api/agent', agent)
  app.route('/api/workflow', workflowRoutes)
  app.route('/api/mcp', mcpRoutes)
  app.route('/api/archive', archiveRoutes)
  app.route('/api/export', exportRoutes)
  app.route('/api/storage', storageRoutes)
  app.route('/api/user', userRoutes)
  app.route('/api/admin', adminRoutes)
  app.route('/api/bookmark', bookmarkRoutes)
  app.route('/api/thread', threadRoutes)
}
