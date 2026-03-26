// task-get 工具 — 获取任务详情
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const TaskGetArgsSchema = z.object({
  id: z.string().describe('Task ID to retrieve'),
})

type TaskGetArgs = z.infer<typeof TaskGetArgsSchema>

export type GetTask = (id: string) => Promise<{
  id: string
  status: string
  prompt?: string
  output?: string
  error?: string
}>

export interface TaskGetOptions {
  get?: GetTask
}

export function createTaskGet(
  _projectRoot: string,
  options: TaskGetOptions
): AgentTool<TaskGetArgs> {
  const { get } = options

  return {
    name: 'task_get',
    description: 'Get the current status and result of a task by its ID.',
    parameters: TaskGetArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!get) {
        throw new Error('get function is not provided in options')
      }

      const task = await get(params.id)
      if (!task) {
        return { content: [{ type: 'text', text: `Task ${params.id} not found` }], isError: true }
      }

      const status = String(task.status).toLowerCase()
      const isFailure = status === 'error' || status === 'failed' || Boolean(task.error)
      const text = [
        `Task: ${task.id}`,
        `Status: ${task.status}`,
        task.prompt ? `Prompt: ${task.prompt}` : undefined,
        `Output: ${task.output ?? 'N/A'}`,
        task.error ? `Error: ${task.error}` : undefined,
      ].filter((line): line is string => Boolean(line)).join('\n')

      return {
        content: [{ type: 'text', text }],
        isError: isFailure,
        details: {
          task,
        },
      }
    },
  }
}
