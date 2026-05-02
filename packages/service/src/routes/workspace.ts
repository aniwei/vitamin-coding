/**
 * workspace.ts
 *
 * 工作区文件系统相关接口（路径验证、目录浏览、文件列表）。
 * 这些是 workspace 操作，与 session 管理无关，独立为此 route。
 */

import { Hono } from 'hono'
import { existsSync, statSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { homedir } from 'node:os'
import type { CodingService } from '../coding-service'

export function createWorkspaceRoute(context: CodingService): Hono {
  const app = new Hono()

  app.post('/verify-path', async (c) => {
    const body = await c.req.json<{ path: string }>()
    const targetPath = body.path

    if (!targetPath) {
      return c.json({ exists: false, isDirectory: false, error: 'path is required' })
    }

    const resolved = targetPath.startsWith('~')
      ? resolve(homedir(), targetPath.slice(2))
      : resolve(targetPath)

    try {
      const stat = statSync(resolved)
      return c.json({
        exists: true,
        isDirectory: stat.isDirectory(),
        path: resolved,
      })
    } catch {
      return c.json({ exists: false, isDirectory: false, path: resolved })
    }
  })

  app.post('/browse-directory', async (c) => {
    const body = await c.req.json<{ path?: string; showHidden?: boolean }>()
    const targetPath = body.path || context.xMars.workspaceDir || homedir()
    const showHidden = body.showHidden ?? false

    const resolved = targetPath.startsWith('~')
      ? resolve(homedir(), targetPath.slice(2))
      : resolve(targetPath)

    if (!existsSync(resolved)) {
      return c.json({
        currentPath: resolved,
        parentPath: dirname(resolved),
        directories: [],
        error: 'path does not exist',
      })
    }

    try {
      const entries = readdirSync(resolved, { withFileTypes: true })
      const directories = entries
        .filter((e) => e.isDirectory())
        .filter((e) => showHidden || !e.name.startsWith('.'))
        .map((e) => ({ name: e.name, path: join(resolved, e.name) }))
        .sort((a, b) => a.name.localeCompare(b.name))

      return c.json({
        currentPath: resolved,
        parentPath: dirname(resolved),
        directories,
        error: null,
      })
    } catch (err: unknown) {
      return c.json({
        currentPath: resolved,
        parentPath: dirname(resolved),
        directories: [],
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  app.get('/files', (c) => {
    const query = c.req.query('query')
    try {
      const entries = readdirSync(context.xMars.workspaceDir, { withFileTypes: true })
      let files = entries.map((e) => ({
        path: join(context.xMars.workspaceDir, e.name),
        name: e.name,
        isFile: e.isFile(),
      }))
      if (query) {
        const q = query.toLowerCase()
        files = files.filter((f) => f.name.toLowerCase().includes(q))
      }
      return c.json({ files })
    } catch {
      return c.json({ files: [] })
    }
  })

  return app
}
