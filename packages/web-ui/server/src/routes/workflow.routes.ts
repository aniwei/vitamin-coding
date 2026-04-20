import { Hono } from 'hono'
import type { AppEnv } from '../app'
import { requireAuth } from '../middleware/require-auth'
import { canCreateWorkflow, canEditWorkflow, canDeleteWorkflow } from '../middleware/permissions'
import { workflowRepository } from '../../../src/lib/db/repository'

export const workflowRoutes = new Hono<AppEnv>()

workflowRoutes.use('/*', requireAuth)

/** GET /api/workflow */
workflowRoutes.get('/', async (c) => {
  const session = c.get('session')!
  const workflows = await workflowRepository.selectAll(session.user.id)
  return c.json(workflows)
})

/** POST /api/workflow */
workflowRoutes.post('/', async (c) => {
  const session = c.get('session')!
  const { name, description, icon, id, isPublished, visibility, noGenerateInputNode } =
    await c.req.json()
  if (id) {
    if (!canEditWorkflow(session))
      return c.json({ error: "You don't have permission to edit workflows" }, 403)
    const hasAccess = await workflowRepository.checkAccess(id, session.user.id, false)
    if (!hasAccess) return c.text('Unauthorized', 401)
  } else {
    if (!canCreateWorkflow(session))
      return c.json({ error: "You don't have permission to create workflows" }, 403)
  }
  const workflow = await workflowRepository.save(
    { name, description, id, isPublished, visibility, icon, userId: session.user.id },
    noGenerateInputNode,
  )
  return c.json(workflow)
})

/** GET /api/workflow/tools */
workflowRoutes.get('/tools', async (c) => {
  const session = c.get('session')!
  const workflows = await workflowRepository.selectExecuteAbility(session.user.id)
  return c.json(workflows)
})

/** GET /api/workflow/:id */
workflowRoutes.get('/:id', async (c) => {
  const session = c.get('session')!
  const { id } = c.req.param()
  const hasAccess = await workflowRepository.checkAccess(id, session.user.id)
  if (!hasAccess) return c.text('Unauthorized', 401)
  const workflow = await workflowRepository.selectById(id)
  return c.json(workflow)
})

/** PUT /api/workflow/:id */
workflowRoutes.put('/:id', async (c) => {
  const session = c.get('session')!
  const { id } = c.req.param()
  const { visibility, isPublished } = await c.req.json()
  if (!canEditWorkflow(session))
    return c.json({ error: 'Only editors and admins can edit workflows' }, 403)
  const hasAccess = await workflowRepository.checkAccess(id, session.user.id, false)
  if (!hasAccess) return c.text('Unauthorized', 401)
  const existing = await workflowRepository.selectById(id)
  if (!existing) return c.text('Workflow not found', 404)
  const updated = await workflowRepository.save({
    ...existing,
    visibility: visibility ?? existing.visibility,
    isPublished: isPublished ?? existing.isPublished,
    updatedAt: new Date(),
  })
  return c.json(updated)
})

/** DELETE /api/workflow/:id */
workflowRoutes.delete('/:id', async (c) => {
  const session = c.get('session')!
  const { id } = c.req.param()
  if (!canDeleteWorkflow(session))
    return c.json({ error: 'Only editors and admins can delete workflows' }, 403)
  const hasAccess = await workflowRepository.checkAccess(id, session.user.id, false)
  if (!hasAccess) return c.text('Unauthorized', 401)
  await workflowRepository.delete(id)
  return c.json({ message: 'Workflow deleted' })
})

/** GET /api/workflow/:id/structure */
workflowRoutes.get('/:id/structure', async (c) => {
  const session = c.get('session')!
  const { id } = c.req.param()
  const hasAccess = await workflowRepository.checkAccess(id, session.user.id)
  if (!hasAccess) return c.text('Unauthorized', 401)
  const workflow = await workflowRepository.selectStructureById(id)
  return c.json(workflow)
})

/** POST /api/workflow/:id/structure */
workflowRoutes.post('/:id/structure', async (c) => {
  const session = c.get('session')!
  const { id } = c.req.param()
  const { nodes, edges, deleteNodes, deleteEdges } = await c.req.json()
  const hasAccess = await workflowRepository.checkAccess(id, session.user.id, false)
  if (!hasAccess) return c.text('Unauthorized', 401)
  await workflowRepository.saveStructure({
    workflowId: id,
    nodes: nodes.map((v: any) => ({ ...v, workflowId: id })),
    edges: edges.map((v: any) => ({ ...v, workflowId: id })),
    deleteNodes,
    deleteEdges,
  })
  return c.json({ success: true })
})

/** POST /api/workflow/:id/execute */
workflowRoutes.post('/:id/execute', async (c) => {
  const session = c.get('session')!
  const { id } = c.req.param()
  const { query } = await c.req.json()
  const hasAccess = await workflowRepository.checkAccess(id, session.user.id)
  if (!hasAccess) return c.text('Unauthorized', 401)
  const workflow = await workflowRepository.selectStructureById(id)
  if (!workflow) return c.text('Workflow not found', 404)

  const { createWorkflowExecutor } = await import(
    '../../../src/lib/ai/workflow/executor/workflow-executor'
  )
  const { encodeWorkflowEvent } = await import(
    '../../../src/lib/ai/workflow/shared.workflow'
  )
  const logger = (await import('../../../src/lib/logger')).default
  const { colorize } = await import('consola/utils')
  const { safeJSONParse, toAny } = await import('../../../src/lib/utils')

  const wfLogger = logger.withDefaults({
    message: colorize('cyan', `WORKFLOW '${workflow.name}' `),
  })
  const app = createWorkflowExecutor({ edges: workflow.edges, nodes: workflow.nodes, logger: wfLogger })
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      let isAborted = false
      app.subscribe((evt: any) => {
        if (isAborted) return
        if ((evt.eventType === 'NODE_START' || evt.eventType === 'NODE_END') && evt.node.name === 'SKIP') return
        try {
          const err = toAny(evt)?.error
          if (err) toAny(evt).error = { name: err.name || 'ERROR', message: err?.message || safeJSONParse(err).value }
          const data = encodeWorkflowEvent(evt)
          controller.enqueue(encoder.encode(data))
          if (evt.eventType === 'WORKFLOW_END') controller.close()
        } catch (e) {
          controller.error(e)
        }
      })
      c.req.raw.signal?.addEventListener('abort', () => {
        isAborted = true
        void (app as any).exit?.()
        controller.close()
      })
      app.run(
        { query },
        { disableHistory: true, timeout: 1000 * 60 * 5 },
      ).then((result: any) => {
        if (!result?.isOk) wfLogger.error('Workflow execution error:', result?.error)
      }).catch((e: any) => {
        wfLogger.error(e)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
})
