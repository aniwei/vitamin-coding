// delegate-task 工具 — 委派任务给子 Agent
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const DelegateTaskArgsSchema = z.object({
  prompt: z.string().describe('Task description to delegate'),
  subagent: z.string().optional().describe('Agent name to delegate the task to (e.g. "explore")'),
  category: z.string().optional().describe('Task category (e.g. "quick", "deep", "search")'),
  mode: z.enum(['sync', 'background']).optional().default('sync').describe('Execution mode'),
  sessionId: z.string().optional().describe('Optional child session ID. When used with sticky mode, later calls can reuse the same child context.'),
  sessionMode: z.enum(['ephemeral', 'sticky']).optional().default('ephemeral').describe('Child session lifecycle. ephemeral deletes the child session after the task; sticky keeps it for later reuse.'),
  slot: z.enum(['normal', 'thinking', 'compact', 'critique', 'vision']).optional().describe('Model slot to use for this task'),
}).refine(
  (data) => data.subagent !== undefined || data.category !== undefined,
  { message: 'Must provide subagent or category' },
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
  sessionId?: string
  sessionMode?: 'ephemeral' | 'sticky'
  slot?: 'normal' | 'thinking' | 'compact' | 'critique' | 'vision'
}) => Promise<TaskDispatchResult>


export function createTaskDelegate(
  _workspaceDir: string,
  dispatch: TaskDispatch
): AgentTool<DelegateTaskArgs> {
  return {
    name: 'task_delegate',
    description: 'Delegate a task to a sub-agent for execution. Provide prompt and subagent/category to dispatch a task.',
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
        sessionId: params.sessionId,
        sessionMode: params.sessionMode,
        slot: params.slot,
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
