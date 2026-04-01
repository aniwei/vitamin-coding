// delegate-task 工具 — 委派任务给子 Agent
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const DelegateTaskArgsSchema = z.object({
  // 方式 A: 从 plan 分发
  planId: z.string().optional().describe('Plan ID — dispatch a task from a plan'),
  taskId: z.string().optional().describe('Task ID within the plan. Required when using planId.'),
  // 方式 B: 独立分发（向后兼容）
  prompt: z.string().optional().describe('Task description to delegate (required when not using planId)'),
  subagent: z.string().optional().describe('Agent name to delegate the task to (e.g. "explore")'),
  category: z.string().optional().describe('Task category (e.g. "quick", "deep", "search")'),
  // 通用
  mode: z.enum(['sync', 'background']).optional().default('sync').describe('Execution mode'),
  sessionId: z.string().optional().describe('Optional child session ID. When used with sticky mode, later calls can reuse the same child context.'),
  sessionMode: z.enum(['ephemeral', 'sticky']).optional().default('ephemeral').describe('Child session lifecycle. ephemeral deletes the child session after the task; sticky keeps it for later reuse.'),
}).refine(
  (data) => {
    if (data.planId !== undefined) {
      return data.taskId !== undefined
    }
    return data.prompt !== undefined && (data.subagent !== undefined || data.category !== undefined)
  },
  { message: 'Must provide either planId + taskId (plan-based dispatch) or prompt + subagent/category (standalone dispatch)' },
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
  prompt?: string
  planId?: string
  taskId?: string
  subagent?: string
  category?: string
  mode: 'sync' | 'background'
  sessionId?: string
  sessionMode?: 'ephemeral' | 'sticky'
}) => Promise<TaskDispatchResult>


export function createTaskDelegate(
  _projectRoot: string,
  dispatch: TaskDispatch
): AgentTool<DelegateTaskArgs> {
  return {
    name: 'task_delegate',
    description: 'Delegate a task to a sub-agent for execution. For plan execution, you must provide both planId and taskId selected by the controller model after reading the plan markdown.',
    parameters: DelegateTaskArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!dispatch) {
        throw new Error('task_delegate function is not provided in options')
      }

      const result = await dispatch({
        prompt: params.prompt,
        planId: params.planId,
        taskId: params.taskId,
        subagent: params.subagent,
        category: params.category,
        mode: params.mode,
        sessionId: params.sessionId,
        sessionMode: params.sessionMode,
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
            planId: params.planId,
            taskId: params.taskId,
            status: result.status,
            sessionId: params.sessionId,
            sessionMode: params.sessionMode,
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
