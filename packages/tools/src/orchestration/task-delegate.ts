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

interface TaskDispatchResult {
  success: boolean
  output?: string
  id?: string
  status?: string
  error?: string
}

// 任务委派函数类型（由 orchestrator 注入）
export type TaskDispatch = (args: {
  prompt: string
  subagent?: string
  category?: string
  mode: 'sync' | 'background'
}) => Promise<TaskDispatchResult>


export function createTaskDelegate(
  _projectRoot: string,
  dispatch: TaskDispatch
): AgentTool<DelegateTaskArgs> {
  return {
    name: 'task_delegate',
    description: 'Delegate a task to a sub-agent for execution. You can specify the sub-agent by name or by category.',
    parameters: DelegateTaskArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!dispatch) {
        throw new Error('task_delegate function is not provided in options')
      }

      const result = await dispatch({
        prompt: params.prompt,
        subagent: params.subagent,
        category: params.category,
        mode: params.mode,
      })

      if (result.success) {
        const isBackground = params.mode === 'background'
        const text = isBackground
          ? `Task delegated in background${result.id ? `: ${result.id}` : ''}${result.output ? `\n${result.output}` : ''}`
          : `Task delegated successfully${result.output ? `: ${result.output}` : ''}`

        return {
          content: [{ type: 'text', text }],
          details: {
            mode: params.mode,
            taskId: result.id,
            status: result.status,
          },
        }
      }

      return {
        content: [{ type: 'text', text: `Task delegation failed: ${result.error ?? 'Unknown error'}` }],
        isError: true,
      }
    },
  }
}
