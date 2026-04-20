import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app'
import { requireAuth } from '../middleware/require-auth'
import { canCreateAgent, canEditAgent, canDeleteAgent } from '../middleware/permissions'
import { agentRepository } from '../../../src/lib/db/repository'
import { serverCache } from '../../../src/lib/cache'
import { CacheKeys } from '../../../src/lib/cache/cache-keys'
import { AgentCreateSchema, AgentQuerySchema, AgentUpdateSchema } from 'app-types/agent'

export const agent = new Hono<AppEnv>()

agent.use('/*', requireAuth)

/** GET /api/agent */
agent.get('/', async (c) => {
  const session = c.get('session')!
  try {
    const queryParams = Object.fromEntries(new URL(c.req.url).searchParams)
    const { type, filters: filtersParam, limit } = AgentQuerySchema.parse(queryParams)
    let filters = filtersParam ? filtersParam.split(',').map((f) => f.trim()) : [type]
    const agents = await agentRepository.selectAgents(session.user.id, filters as any, limit)
    return c.json(agents)
  } catch (error) {
    if (error instanceof z.ZodError)
      return c.json({ error: 'Invalid query parameters', details: error.message }, 400)
    console.error('Failed to fetch agents:', error)
    return c.text('Internal Server Error', 500)
  }
})

/** POST /api/agent */
agent.post('/', async (c) => {
  const session = c.get('session')!
  if (!canCreateAgent(session)) return c.json({ error: "You don't have permission to create agents" }, 403)
  try {
    const body = await c.req.json()
    const data = AgentCreateSchema.parse(body)
    const agent = await agentRepository.insertAgent({ ...data, userId: session.user.id })
    return c.json(agent)
  } catch (error) {
    if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.message }, 400)
    console.error('Failed to create agent:', error)
    return c.text('Internal Server Error', 500)
  }
})

/** GET /api/agent/:id */
agent.get('/:id', async (c) => {
  const session = c.get('session')!
  const { id } = c.req.param()
  const hasAccess = await agentRepository.checkAccess(id, session.user.id)
  if (!hasAccess) return c.text('Unauthorized', 401)
  const agent = await agentRepository.selectAgentById(id, session.user.id)
  return c.json(agent)
})

/** PUT /api/agent/:id */
agent.put('/:id', async (c) => {
  const session = c.get('session')!
  if (!canEditAgent(session)) return c.json({ error: 'Only editors and admins can edit agents' }, 403)
  try {
    const { id } = c.req.param()
    const body = await c.req.json()
    const data = AgentUpdateSchema.parse(body)
    const hasAccess = await agentRepository.checkAccess(id, session.user.id)
    if (!hasAccess) return c.text('Unauthorized', 401)
    const existingAgent = await agentRepository.selectAgentById(id, session.user.id)
    if (existingAgent && existingAgent.userId !== session.user.id) {
      data.visibility = existingAgent.visibility
    }
    const agent = await agentRepository.updateAgent(id, session.user.id, data)
    serverCache.delete(CacheKeys.agentInstructions(agent.id))
    return c.json(agent)
  } catch (error) {
    if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.message }, 400)
    console.error('Failed to update agent:', error)
    return c.json({ message: 'Internal Server Error' }, 500)
  }
})

/** DELETE /api/agent/:id */
agent.delete('/:id', async (c) => {
  const session = c.get('session')!
  if (!canDeleteAgent(session)) return c.json({ error: 'Only editors and admins can delete agents' }, 403)
  const { id } = c.req.param()
  const hasAccess = await agentRepository.checkAccess(id, session.user.id)
  if (!hasAccess) return c.text('Unauthorized', 401)
  await agentRepository.deleteAgent(id, session.user.id)
  serverCache.delete(CacheKeys.agentInstructions(id))
  return c.json({ success: true })
})
