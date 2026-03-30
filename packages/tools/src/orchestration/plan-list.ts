// plan_list 工具 — 列出计划
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const PlanListArgsSchema = z.object({
  status: z.string().optional().describe('Filter by plan status (active, completed, paused, etc.)'),
})

type PlanListArgs = z.infer<typeof PlanListArgsSchema>

export type PlanList = (args: {
  status?: string
  sessionId: string
}) => Promise<{
  plans: Array<{
    id: string
    name: string
    status: string
    taskCount: number
    completedCount: number
  }>
  error?: string
}>

export function createPlanList(
  _projectRoot: string,
  list: PlanList,
): AgentTool<PlanListArgs> {
  return {
    name: 'plan_list',
    description: 'List plans for the current session. Optionally filter by status.',
    parameters: PlanListArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      const result = await list({
        status: params.status,
        sessionId: '', // filled by orchestrator callback
      })

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Failed to list plans: ${result.error}` }],
          isError: true,
        }
      }

      if (result.plans.length === 0) {
        return {
          content: [{ type: 'text', text: 'No plans found.' }],
        }
      }

      const text = result.plans
        .map(p => `- [${p.status}] ${p.name} (${p.id}) — ${p.completedCount}/${p.taskCount} tasks`)
        .join('\n')

      return {
        content: [{ type: 'text', text: `Plans:\n${text}` }],
      }
    },
  }
}
