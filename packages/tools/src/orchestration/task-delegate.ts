// delegate-task 工具 — 委派任务给子 Agent
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const DelegateTaskArgsSchema = z.object({
  prompt: z.string().describe('Task description to delegate'),
  subagent: z.string().optional().describe('Agent name to delegate the task to (e.g. "explore")'),
  category: z.string().optional().describe('Task category (e.g. "quick", "deep", "search")'),
  mode: z.enum(['sync', 'background']).optional().default('sync').describe('Execution mode'),
}).refine(
  (data) => data.subagent !== undefined || data.category !== undefined,
  { message: 'Must specify either subagent or category' },
)

type DelegateTaskArgs = z.infer<typeof DelegateTaskArgsSchema>

// 任务委派函数类型（由 orchestrator 注入）
export type TaskDispatch = (args: {
  prompt: string
  subagent?: string
  category?: string
  mode: 'sync' | 'background'
}) => Promise<TaskDispatchResult>

export interface TaskDispatchResult {
  success: boolean
  output?: string
  id?: string
  error?: string
}

export function createTaskDelegate(
  _projectRoot: string,
  dispatch: TaskDispatch
): AgentTool<DelegateTaskArgs> {
  return {
    name: 'task_delegate',
    description: 'Delegate a task to a sub-agent for execution. You can specify the sub-agent by name or by category.',
    parameters: DelegateTaskArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      if (!dispatch) {
        throw new Error('task_delegate function is not provided in options')
      }

      const result = await dispatch({
        prompt: args.prompt,
        subagent: args.subagent,
        category: args.category,
        mode: args.mode,
      })

      if (result.success) {
        return {
          content: [{ type: 'text', text: `Task delegated successfully${result.output ? `: ${result.output}` : ''}` }]
        }
      }

      throw new Error(`Task delegation failed: ${result.error ?? 'Unknown error'}`)
    },
  }
}
