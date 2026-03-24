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

      throw new Error(task.error ?? `Task ${params.id} status: ${task.status}\nOutput: ${task.output ?? 'N/A'}`)  
    },
  }
}
