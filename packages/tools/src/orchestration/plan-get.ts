// plan_get 工具 — 获取计划详情（支持 summary / full 模式）
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const PlanGetArgsSchema = z.object({
  planId: z.string().optional().describe('Plan ID to retrieve. If omitted, returns the active plan for the current session.'),
  detail: z.enum(['summary', 'full']).optional().default('summary').describe('Detail level: summary (default) or full'),
})

type PlanGetArgs = z.infer<typeof PlanGetArgsSchema>

export type PlanGet = (args: {
  planId?: string
  detail: 'summary' | 'full'
  sessionId: string
}) => Promise<{
  found: boolean
  text: string
  error?: string
}>

export function createPlanGet(
  _projectRoot: string,
  get: PlanGet,
): AgentTool<PlanGetArgs> {
  return {
    name: 'plan_get',
    description: 'Get plan details. Returns a summary by default (name, goal, task status list). Use detail="full" to load the complete plan Markdown file for analysis and recovery.',
    parameters: PlanGetArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      const result = await get({
        planId: params.planId,
        detail: params.detail,
        sessionId: '', // filled by orchestrator callback
      })

      if (!result.found) {
        return {
          content: [{ type: 'text', text: result.error ?? 'No plan found' }],
          isError: true,
        }
      }

      return {
        content: [{ type: 'text', text: result.text }],
      }
    },
  }
}
