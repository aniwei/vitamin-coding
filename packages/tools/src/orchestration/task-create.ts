// task-create 工具 — 创建后台任务
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const TaskCreateArgsSchema = z.object({
  prompt: z.string().describe('任务描述'),
  category: z.string().optional().describe('任务类别'),
  subagent: z.string().optional().describe('指定执行 Agent'),
})

type TaskCreateArgs = z.infer<typeof TaskCreateArgsSchema>

type CreateTaskArgs = {
  prompt: string
  category?: string
  subagent?: string
}

export type CreateTask = (args: CreateTaskArgs) => Promise<{
  id: string
  success: boolean
  error?: string
}>

export function createTaskCreate(
  _projectRoot: string, 
  create: CreateTask
): AgentTool<TaskCreateArgs> {

  return {
    name: 'task_create',
    description: '创建一个后台任务',
    parameters: TaskCreateArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!create) {
        throw new Error('create function is not provided in options')
      }

      const result = await create({
        prompt: params.prompt,
        category: params.category,
        subagent: params.subagent,
      })

      if (result.success) {
        return {
          content: [{ type: 'text', text: `Task created: ${result.id}` }],
        }
      }

      throw new Error(result.error ?? 'Unknown error creating task')
    },
  }
}
