import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const TaskListArgsSchema = z.object({
  status: z
    .enum(['all', 'pending', 'running', 'completed', 'error'])
    .optional()
    .default('all')
    .describe('Filter tasks by status (default: all)'),
})

type TaskListArgs = z.infer<typeof TaskListArgsSchema>

export type ListTasks = (status?: string) => Promise<{
  success: boolean
  tasks: Array<{
    id: string
    prompt: string
    status: string
  }>
  error?: string
}>

export interface TaskListOptions {
  list?: ListTasks
}

export function createTaskList(
  _projectRoot: string,
  options: TaskListOptions,
): AgentTool<TaskListArgs> {
  const { list } = options

  return {
    name: 'task_list',
    description: 'List all tasks and their status',
    parameters: TaskListArgsSchema,
    visibility: 'always',
    readonly: true,

    async execute({ params }): Promise<ToolResult> {
      if (!list) {
        return { content: [{ type: 'text', text: 'task_list not available' }], isError: true }
      }

      const filter = params.status === 'all' ? undefined : params.status
      const result = await list(filter)

      if (result.success) {
        const tasks = result.tasks
        if (tasks.length === 0) {
          return { content: [{ type: 'text', text: 'No tasks found.' }] }
        }

        const text = tasks
          .map((t) => `- [${t.status}] ${t.id}: ${t.prompt.slice(0, 80)}`)
          .join('\n')

        return { content: [{ type: 'text', text }] }
      }

      throw new Error(result.error ?? 'Unknown error listing tasks')
    },
  }
}
