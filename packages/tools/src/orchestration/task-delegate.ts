// delegate-task 工具 — 委派任务给子 Agent
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const DelegateTaskArgsSchema = z.object({
  prompt: z.string().describe('要委派的任务描述'),
  subagent: z.string().optional().describe('指定子Agent名称（如 "explore"）'),
  category: z.string().optional().describe('任务类别（如 "quick"、"deep"、"search"）'),
  mode: z.enum(['sync', 'background']).optional().default('sync').describe('执行模式'),
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

export interface DelegateTaskOptions {
  dispatch?: TaskDispatch
}

export function createDelegateTask(
  _projectRoot: string,
  options: DelegateTaskOptions
): AgentTool<DelegateTaskArgs> {
  const { dispatch } = options

  return {
    name: 'task_delegate',
    description: '委派任务给子Agent执行，可指定Agent名称或任务类别',
    parameters: DelegateTaskArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      if (!dispatch) {
        return {
          content: [{ type: 'text', text: 'task_delegate is not available: orchestrator not initialized' }],
          isError: true,
        }
      }

      try {
        const result = await dispatch({
          prompt: args.prompt,
          subagent: args.subagent,
          category: args.category,
          mode: args.mode,
        })

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `Task delegation failed: ${result.error ?? 'Unknown error'}` }],
            isError: true,
          }
        }

        if (args.mode === 'background') {
          return {
            content: [{ type: 'text', text: `Background task started: ${result.id ?? 'unknown'}` }],
            metadata: { id: result.id, mode: 'background' },
          }
        }

        return {
          content: [{ type: 'text', text: result.output ?? 'Task completed with no output' }],
          metadata: { mode: 'sync' },
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        
        return {
          content: [{ type: 'text', text: `Task delegation error: ${message}` }],
          isError: true,
        }
      }
    },
  }
}
