// task-get 工具 — 获取任务详情
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const TaskGetArgsSchema = z.object({
  taskId: z.string().describe('任务 ID'),
})

type TaskGetArgs = z.infer<typeof TaskGetArgsSchema>

export type GetTask = (taskId: string) => Promise<{
  taskId: string
  status: string
  output?: string
  error?: string
} | undefined>

export function createTaskGetTool(get?: GetTask): AgentTool<TaskGetArgs> {
  return {
    name: 'task_get',
    description: '获取任务的当前状态和结果。',
    parameters: TaskGetArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      if (!get) {
        return { content: [{ type: 'text', text: 'task_get not available' }], isError: true }
      }

      const task = await get(args.taskId)
      if (!task) {
        return { content: [{ type: 'text', text: `Task ${args.taskId} not found` }], isError: true }
      }

      const text = [
        `Task: ${task.taskId}`,
        `Status: ${task.status}`,
        task.output ? `Output:\n${task.output}` : '',
        task.error ? `Error:\n${task.error}` : '',
      ].filter(Boolean).join('\n')

      return { content: [{ type: 'text', text }] }
    },
  }
}
