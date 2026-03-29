// 启动计划执行
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const PerformWorkArgsSchema = z.object({
  name: z.string().describe('Name of the plan to execute'),
})

type PerformWorkArgs = z.infer<typeof PerformWorkArgsSchema>

export type PerformWork = (name: string) => Promise<{
  success: boolean
  taskId?: string
  message?: string
  error?: Error | string
}>


export function createPerformWork(
  _projectRoot: string, 
  performWork: PerformWork
): AgentTool<PerformWorkArgs> {

  return {
    name: 'perform_work',
    description: 'Execute the next pending step of a plan file. Each call advances one step; the caller should loop to complete all steps. Requires PlanFileStore in orchestrator options.',
    parameters: PerformWorkArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!performWork) {
        throw new Error('perform_work function is not provided in options')
      }

      const result = await performWork(params.name)

      if (result.success) {
        const suffix = result.taskId ? ` (task: ${result.taskId})` : ''
        return {
          content: [{ type: 'text', text: `Work started successfully${suffix}${result.message ? `\n${result.message}` : ''}` }],
          details: {
            taskId: result.taskId,
          },
        }
      }

      const errorMessage = typeof result.error === 'string'
        ? result.error
        : result.error?.message

      return {
        content: [{ type: 'text', text: `Failed to start work: ${errorMessage ?? 'unknown error'}` }],
        isError: true,
        details: {
          error: result.error,
        }
      }
    },
  }
}
