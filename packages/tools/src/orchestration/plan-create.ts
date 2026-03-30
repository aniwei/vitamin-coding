// plan_create 工具 — 创建结构化计划
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const TaskTypeEnum = z.enum([
  'code_generation', 'code_modification', 'refactoring',
  'testing', 'debugging', 'research', 'documentation',
  'review', 'infrastructure', 'custom',
])

const PlanCreateArgsSchema = z.object({
  name: z.string().describe('Plan name'),
  goal: z.string().describe('Plan goal — what should be achieved'),
  architecture: z.string().optional().describe('Architecture overview'),
  constraints: z.array(z.string()).optional().describe('Constraints or requirements'),
  tasks: z.array(z.object({
    title: z.string().describe('Task title'),
    description: z.string().describe('Detailed task description'),
    type: TaskTypeEnum.describe('Task type — determines sub-agent selection'),
    dependencies: z.array(z.string()).optional().describe('IDs of tasks this depends on'),
    files: z.array(z.string()).optional().describe('Files involved'),
    estimatedComplexity: z.enum(['low', 'medium', 'high']).optional().describe('Estimated complexity'),
  })).describe('Ordered list of tasks'),
})

type PlanCreateArgs = z.infer<typeof PlanCreateArgsSchema>

export type PlanCreate = (args: PlanCreateArgs & { sessionId: string }) => Promise<{
  planId: string
  taskCount: number
  status: string
  error?: string
}>

export function createPlanCreate(
  _projectRoot: string,
  create: PlanCreate,
): AgentTool<PlanCreateArgs> {
  return {
    name: 'plan_create',
    description: 'Create a structured plan with ordered tasks. Use this for complex multi-step work spanning multiple files or requiring different expertise.',
    parameters: PlanCreateArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      const result = await create({
        ...params,
        sessionId: '', // filled by orchestrator callback
      })

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Failed to create plan: ${result.error}` }],
          isError: true,
        }
      }

      const taskSummary = params.tasks
        .map((t, i) => `  ${i + 1}. [${t.type}] ${t.title}${t.dependencies?.length ? ` (depends: ${t.dependencies.join(', ')})` : ''}`)
        .join('\n')

      return {
        content: [{
          type: 'text',
          text: `Plan created: ${params.name}\nID: ${result.planId}\nStatus: ${result.status}\nTasks (${result.taskCount}):\n${taskSummary}`,
        }],
        details: { planId: result.planId, taskCount: result.taskCount },
      }
    },
  }
}
