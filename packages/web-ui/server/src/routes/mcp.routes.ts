import { Hono } from 'hono'
import type { AppEnv } from '../app'
import { requireAuth } from '../middleware/require-auth'
import { canCreateMCP, canManageMCPServer, isAdmin } from '../middleware/permissions'
import {
  mcpRepository,
  mcpServerCustomizationRepository,
  mcpMcpToolCustomizationRepository,
  mcpOAuthRepository,
} from '../../../src/lib/db/repository'
import { pgMcpRepository } from '../../../src/lib/db/pg/repositories/mcp-repository.pg'
import { mcpClientsManager } from '../../../src/lib/ai/mcp/mcp-manager'
import { McpServerCustomizationZodSchema, McpToolCustomizationZodSchema } from 'app-types/mcp'
import type { MCPServerInfo } from 'app-types/mcp'
import { serverCache } from '../../../src/lib/cache'
import { CacheKeys } from '../../../src/lib/cache/cache-keys'
import globalLogger from '../../../src/lib/logger'
import { colorize } from 'consola/utils'

export const mcpRoutes = new Hono<AppEnv>()

mcpRoutes.use('/*', requireAuth)

// ── /api/mcp (POST — 新增 MCP server) ─────────────────────────────────────
mcpRoutes.post('/', async (c) => {
  const session = c.get('session')!
  if (!canCreateMCP(session)) return c.json({ error: "You don't have permission to create MCP connections" }, 403)

  const json = await c.req.json()
  try {
    const { saveMcpClientAction } = await import('../../../src/app/api/mcp/actions')
    const result = await saveMcpClientAction(json)
    return c.json({ success: true, id: result.client.getInfo().id })
  } catch (error: any) {
    globalLogger.error('Failed to save MCP client', { error })
    return c.json({ message: error.message || 'Failed to save MCP client' }, 500)
  }
})

// ── /api/mcp/list ─────────────────────────────────────────────────────────
mcpRoutes.get('/list', async (c) => {
  const session = c.get('session')!
  const [servers, memoryClients] = await Promise.all([
    mcpRepository.selectAllForUser(session.user.id),
    mcpClientsManager.getClients(),
  ])
  const memoryMap = new Map(memoryClients.map(({ id, client }) => [id, client] as const))
  const addTargets = servers.filter((server) => !memoryMap.has(server.id))
  if (addTargets.length > 0) {
    Promise.allSettled(addTargets.map((server) => mcpClientsManager.refreshClient(server.id)))
  }
  const result = servers.map((server) => {
    const mem = memoryMap.get(server.id)
    const clientEntry = mem
    return {
      ...server,
      config: server.userId === session.user.id ? server.config : undefined,
      enabled: (clientEntry as any)?.getInfo?.()?.enabled ?? true,
      status: (clientEntry as any)?.getInfo?.()?.status ?? 'disconnected',
      error: (clientEntry as any)?.getInfo?.()?.error,
      toolInfo: (clientEntry as any)?.getInfo?.()?.toolInfo ?? [],
    } as MCPServerInfo
  })
  return c.json(result)
})

// ── /api/mcp/:id (GET) ────────────────────────────────────────────────────
mcpRoutes.get('/:id', async (c) => {
  const { id } = c.req.param()
  const clientEntry = await mcpClientsManager.getClient(id)
  if (!clientEntry) return c.json({ error: 'MCP client not found' }, 404)
  return c.json({ ...clientEntry.client.getInfo(), id })
})

// ── /api/mcp/:id/call-tool (POST) ─────────────────────────────────────────
mcpRoutes.post('/:id/call-tool', async (c) => {
  const { id } = c.req.param()
  try {
    const { toolName, input } = await c.req.json()
    if (!toolName) return c.json({ error: 'toolName is required' }, 400)
    const result = await mcpClientsManager.toolCall(id, toolName, input ?? {})
    return c.json(result)
  } catch (error: any) {
    return c.json({ error: error.message || 'Tool call failed' }, 500)
  }
})

// ── /api/mcp/:id/refresh (POST) ───────────────────────────────────────────
mcpRoutes.post('/:id/refresh', async (c) => {
  const { id } = c.req.param()
  try {
    await mcpClientsManager.refreshClient(id)
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message || 'Refresh failed' }, 500)
  }
})

// ── /api/mcp/:id/authorize (POST) ─────────────────────────────────────────
mcpRoutes.post('/:id/authorize', async (c) => {
  const { id } = c.req.param()
  try {
    await mcpClientsManager.refreshClient(id)
    const client = await mcpClientsManager.getClient(id)
    if ((client as any)?.client?.status !== 'authorizing') {
      return c.json({ error: 'Not Authorizing' }, 400)
    }
    const authUrl = (client as any)?.client?.getAuthorizationUrl?.()?.toString()
    return c.json({ authorizationUrl: authUrl })
  } catch (error: any) {
    return c.json({ error: error.message || 'Authorization failed' }, 500)
  }
})

// ── /api/mcp/:id/check-token (GET) ────────────────────────────────────────
mcpRoutes.get('/:id/check-token', async (c) => {
  const { id } = c.req.param()
  try {
    const session = await mcpOAuthRepository.getAuthenticatedSession(id)
    await mcpClientsManager.getClient(id).catch(() => null)
    return c.json({ hasToken: !!session?.tokens })
  } catch (error: any) {
    return c.json({ hasToken: false })
  }
})

// ── /api/mcp/:id/share (PUT) ──────────────────────────────────────────────
mcpRoutes.put('/:id/share', async (c) => {
  const session = c.get('session')!
  const { id } = c.req.param()
  try {
    if (!isAdmin(session)) return c.json({ error: 'Only administrators can feature MCP servers' }, 403)
    const { visibility } = await c.req.json()
    await pgMcpRepository.updateVisibility(id, visibility)
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message || 'Share failed' }, 500)
  }
})

// ── /api/mcp/exists/:serverName (GET) ─────────────────────────────────────
mcpRoutes.get('/exists/:serverName', async (c) => {
  const { serverName } = c.req.param()
  const session = c.get('session')!
  try {
    const servers = await pgMcpRepository.selectAllForUser(session.user.id)
    const exists = servers.some((s) => s.name === serverName)
    return c.json({ exists })
  } catch (error: any) {
    return c.json({ exists: false })
  }
})

// ── /api/mcp/:id (DELETE) ─────────────────────────────────────────────────
mcpRoutes.delete('/:id', async (c) => {
  const session = c.get('session')!
  const { id } = c.req.param()
  try {
    const mcpServer = await pgMcpRepository.selectById(id)
    if (!mcpServer) return c.json({ error: 'MCP server not found' }, 404)
    if (!canManageMCPServer(mcpServer.userId, mcpServer.visibility, session))
      return c.json({ error: 'Unauthorized' }, 403)
    const { removeMcpClientAction } = await import('../../../src/app/api/mcp/actions')
    await removeMcpClientAction(id)
    return c.json({ success: true })
  } catch (error: any) {
    globalLogger.error('Failed to delete MCP server:', error)
    return c.json({ error: error.message || 'Failed to delete MCP server' }, 500)
  }
})

// ── /api/mcp/server-customizations/:server ────────────────────────────────
mcpRoutes.get('/server-customizations/:server', async (c) => {
  const session = c.get('session')!
  const { server } = c.req.param()
  const result = await mcpServerCustomizationRepository.selectByUserIdAndMcpServerId({
    mcpServerId: server,
    userId: session.user.id,
  })
  return c.json(result ?? {})
})

mcpRoutes.post('/server-customizations/:server', async (c) => {
  const session = c.get('session')!
  const { server } = c.req.param()
  const body = await c.req.json()
  const { mcpServerId, prompt } = McpServerCustomizationZodSchema.parse({
    ...body,
    mcpServerId: server,
  })
  const result = await mcpServerCustomizationRepository.upsertMcpServerCustomization({
    userId: session.user.id,
    mcpServerId,
    prompt,
  })
  void serverCache.delete(CacheKeys.mcpServerCustomizations(session.user.id))
  return c.json(result)
})

mcpRoutes.delete('/server-customizations/:server', async (c) => {
  const session = c.get('session')!
  const { server } = c.req.param()
  await mcpServerCustomizationRepository.deleteMcpServerCustomizationByMcpServerIdAndUserId({
    mcpServerId: server,
    userId: session.user.id,
  })
  void serverCache.delete(CacheKeys.mcpServerCustomizations(session.user.id))
  return c.json({ success: true })
})

// ── /api/mcp/tool-customizations/:server ─────────────────────────────────
mcpRoutes.get('/tool-customizations/:server', async (c) => {
  const session = c.get('session')!
  const { server } = c.req.param()
  const result = await mcpMcpToolCustomizationRepository.selectByUserIdAndMcpServerId({
    mcpServerId: server,
    userId: session.user.id,
  })
  return c.json(result)
})

// ── /api/mcp/tool-customizations/:server/:tool ────────────────────────────
mcpRoutes.get('/tool-customizations/:server/:tool', async (c) => {
  const session = c.get('session')!
  const { server, tool } = c.req.param()
  const result = await mcpMcpToolCustomizationRepository.select({
    mcpServerId: server,
    userId: session.user.id,
    toolName: tool,
  })
  return c.json(result ?? {})
})

mcpRoutes.post('/tool-customizations/:server/:tool', async (c) => {
  const session = c.get('session')!
  const { server, tool } = c.req.param()
  const body = await c.req.json()
  const { mcpServerId, toolName, prompt } = McpToolCustomizationZodSchema.parse({
    ...body,
    mcpServerId: server,
    toolName: tool,
  })
  const result = await mcpMcpToolCustomizationRepository.upsert({
    userId: session.user.id,
    mcpServerId,
    toolName,
    prompt,
  })
  void serverCache.delete(CacheKeys.mcpServerCustomizations(session.user.id))
  return c.json(result)
})

mcpRoutes.delete('/tool-customizations/:server/:tool', async (c) => {
  const session = c.get('session')!
  const { server, tool } = c.req.param()
  await mcpMcpToolCustomizationRepository.delete({
    mcpServerId: server,
    userId: session.user.id,
    toolName: tool,
  })
  void serverCache.delete(CacheKeys.mcpServerCustomizations(session.user.id))
  return c.json({ success: true })
})

// ── /api/mcp/oauth/callback ────────────────────────────────────────────────
// OAuth callback 不需要登录态（来自 OAuth provider redirect），单独处理。
mcpRoutes.get('/oauth/callback', async (c) => {
  const oauthLogger = globalLogger.withDefaults({ message: colorize('bgGreen', 'MCP OAuth: ') })
  const url = new URL(c.req.url)
  const code = url.searchParams.get('code') ?? undefined
  const state = url.searchParams.get('state') ?? undefined
  const error = url.searchParams.get('error') ?? undefined
  const error_description = url.searchParams.get('error_description') ?? undefined

  const makeHtml = (type: 'success' | 'error', heading: string, message: string, postMsgType: string, data: Record<string, any>, status: number) => {
    const color = type === 'success' ? '#22c55e' : '#ef4444'
    const dataStr = Object.entries(data).map(([k, v]) => `${k}: '${v}'`).join(', ')
    const html = `<!DOCTYPE html><html><head><title>MCP OAuth</title></head><body>
<script>try{window.opener?.postMessage({type:'${postMsgType}',${dataStr}},window.location.origin);}catch(e){}setTimeout(()=>window.close(),1000);</script>
<div style="color:${color};text-align:center;padding:2rem"><h2>${heading}</h2><p>${message}</p></div></body></html>`
    return c.html(html, status as any)
  }

  if (error) {
    return makeHtml('error', 'Authentication Failed', `${error}: ${error_description || ''}`, 'MCP_OAUTH_ERROR', { error, error_description: error_description || '' }, 400)
  }
  if (!code || !state) {
    return makeHtml('error', 'Authentication Failed', 'Missing parameters', 'MCP_OAUTH_ERROR', { error: 'invalid_request', error_description: 'Missing code or state' }, 400)
  }

  const oauthSession = await mcpOAuthRepository.getSessionByState(state)
  if (!oauthSession) {
    return makeHtml('error', 'Authentication Failed', 'Invalid state', 'MCP_OAUTH_ERROR', { error: 'invalid_state', error_description: 'OAuth session not found' }, 400)
  }

  try {
    const clientEntry = await mcpClientsManager.getClient(oauthSession.mcpServerId)
    if (!clientEntry) throw new Error('MCP client not found')
    await (clientEntry as any).client.finishAuth(code, state)
    await mcpClientsManager.refreshClient(oauthSession.mcpServerId)
    return makeHtml('success', 'Authentication Successful', 'You can close this window.', 'MCP_OAUTH_SUCCESS', { serverId: oauthSession.mcpServerId }, 200)
  } catch (err: any) {
    oauthLogger.error('OAuth callback error:', err)
    return makeHtml('error', 'Authentication Failed', err.message || 'Unknown error', 'MCP_OAUTH_ERROR', { error: 'callback_failed', error_description: err.message || '' }, 500)
  }
})
