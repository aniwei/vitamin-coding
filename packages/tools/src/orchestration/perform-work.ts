// 启动计划执行
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const PerformWorkArgsSchema = z.object({
  name: z.string().describe('Name of the plan to execute'),
})

type PerformWorkArgs = z.infer<typeof PerformWorkArgsSchema>

export type PerformWork = (name: string) => Promise<{ success: boolean; error: Error }>


export function createPerformWork(
  _projectRoot: string, 
  performWork: PerformWork
): AgentTool<PerformWorkArgs> {

  return {
    name: 'perform_work',
    description: 'Start the execution of a generated plan. The Worker will execute plan steps in parallel according to the DAG topology.',
    parameters: PerformWorkArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!performWork) {
        throw new Error('perform_work function is not provided in options')
      }

      const result = await performWork(params.name)

      if (result.success) {
        return {
          content: [{ type: 'text', text: 'Work started successfully' }],
        }
      }

      return {
        content: [{ type: 'text', text: `Failed to start work: ${result.error?.message ?? 'unknown error'}` }],
        isError: true,
        details: {
          error: result.error,
        }
      }
    },
  }
}
