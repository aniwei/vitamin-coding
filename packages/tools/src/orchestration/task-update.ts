import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const TaskUpdateArgsSchema = z.object({
  id: z.string().describe('Task ID to update'),
  action: z.enum(['cancel', 'retry']).describe('Action to perform'),
})

type TaskUpdateArgs = z.infer<typeof TaskUpdateArgsSchema>

export type UpdateTask = (id: string, action: 'cancel' | 'retry') => Promise<{
  success: boolean
  message: string
}>

export interface TaskUpdateOptions {
  update?: UpdateTask
}

export function createTaskUpdate(
  _projectRoot: string,
  options: TaskUpdateOptions
): AgentTool<TaskUpdateArgs> {
  const { update } = options

  return {
    name: 'task_update',
    description: 'Update task status: cancel or retry a task.',
    parameters: TaskUpdateArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!update) {
        return { content: [{ type: 'text', text: 'task_update not available' }], isError: true }
      }

      const result = await update(params.id, params.action)

      if (result.success) {
        return {
          content: [{ type: 'text', text: result.message }],
          isError: !result.success,
        }
      }

      throw new Error(result.message || 'Unknown error updating task')
    },
  }
}
