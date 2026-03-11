// task-list 工具 — 列出所有任务
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const TaskListArgsSchema = z.object({
  status: z.enum(['all', 'pending', 'running', 'completed', 'error']).optional()
    .default('all')
    .describe('过滤任务状态'),
})

type TaskListArgs = z.infer<typeof TaskListArgsSchema>

export type ListTasks = (status?: string) => Promise<Array<{
  taskId: string
  status: string
  prompt: string
}>>

export function createTaskListTool(listFn?: ListTasks): AgentTool<TaskListArgs> {
  return {
    name: 'task_list',
    description: '列出所有任务及其状态。',
    parameters: TaskListArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      if (!listFn) {
        return { content: [{ type: 'text', text: 'task_list not available' }], isError: true }
      }

      const filter = args.status === 'all' ? undefined : args.status
      const tasks = await listFn(filter)

      if (tasks.length === 0) {
        return { content: [{ type: 'text', text: 'No tasks found.' }] }
      }

      const text = tasks
        .map((t) => `- [${t.status}] ${t.taskId}: ${t.prompt.slice(0, 80)}`)
        .join('\n')

      return { content: [{ type: 'text', text }] }
    },
  }
}
