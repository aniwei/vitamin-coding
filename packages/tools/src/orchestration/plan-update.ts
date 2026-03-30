// plan_update 工具 — 更新计划（添加/移除任务、修改状态等）
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const TaskTypeEnum = z.enum([
  'code_generation', 'code_modification', 'refactoring',
  'testing', 'debugging', 'research', 'documentation',
  'review', 'infrastructure', 'custom',
])

const PlanUpdateArgsSchema = z.object({
  planId: z.string().describe('Plan ID to update'),
  action: z.enum([
    'add_tasks', 'remove_task', 'update_task',
    'pause', 'resume', 'complete', 'cancel',
  ]).describe('Update action'),
  // add_tasks
  tasks: z.array(z.object({
    title: z.string(),
    description: z.string(),
    type: TaskTypeEnum,
    dependencies: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
    estimatedComplexity: z.enum(['low', 'medium', 'high']).optional(),
  })).optional().describe('Tasks to add (for add_tasks action)'),
  // remove_task / update_task
  taskId: z.string().optional().describe('Task ID (for remove_task / update_task)'),
  // update_task
  taskPatch: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    type: TaskTypeEnum.optional(),
    dependencies: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
    status: z.enum(['pending', 'ready', 'running', 'completed', 'failed', 'skipped', 'blocked']).optional(),
    attempts: z.number().int().nonnegative().optional(),
    startedAt: z.number().int().optional(),
    completedAt: z.number().int().optional(),
    output: z.object({
      summary: z.string(),
      text: z.string().optional(),
      artifacts: z.record(z.string(), z.unknown()).optional(),
    }).optional(),
    error: z.object({
      code: z.string(),
      message: z.string(),
      retriable: z.boolean().optional(),
    }).optional(),
  }).optional().describe('Task fields to update (for update_task)'),
})

type PlanUpdateArgs = z.infer<typeof PlanUpdateArgsSchema>

export type PlanUpdate = (args: PlanUpdateArgs) => Promise<{
  success: boolean
  text: string
  error?: string
}>

export function createPlanUpdate(
  _projectRoot: string,
  update: PlanUpdate,
): AgentTool<PlanUpdateArgs> {
  return {
    name: 'plan_update',
    description: 'Update an existing plan: add/remove/modify tasks, or change plan status (pause, resume, complete, cancel).',
    parameters: PlanUpdateArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      const result = await update(params)

      if (!result.success) {
        return {
          content: [{ type: 'text', text: result.error ?? 'Failed to update plan' }],
          isError: true,
        }
      }

      return {
        content: [{ type: 'text', text: result.text }],
      }
    },
  }
}
