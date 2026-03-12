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
}>

export function createTaskCreate(create?: CreateTask): AgentTool<TaskCreateArgs> {
  return {
    name: 'task_create',
    description: '创建一个后台任务',
    parameters: TaskCreateArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      if (!create) {
        return { content: [{ type: 'text', text: 'task_create not available' }], isError: true }
      }

      const result = await create({
        prompt: args.prompt,
        category: args.category,
        subagent: args.subagent,
      })

      return { content: [{ type: 'text', text: `Task created: ${result.id}` }] }
    },
  }
}
