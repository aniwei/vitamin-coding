// 启动计划执行
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const PerformWorkArgsSchema = z.object({
  planName: z.string().describe('要执行的计划名称'),
})

type PerformWorkArgs = z.infer<typeof PerformWorkArgsSchema>

export type PerformWork = (planName: string) => Promise<{ success: boolean; message: string }>

interface PerformWorkOptions {
  performWork?: PerformWork
}

export function createPerformWork(options: PerformWorkOptions): AgentTool<PerformWorkArgs> {
  const { performWork } = options

  return {
    name: 'perform_work',
    description: '启动一个已生成的计划的执行，Worker 将按 DAG 拓扑并行执行计划步骤',
    parameters: PerformWorkArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      if (!performWork) {
        return {
          content: [{ type: 'text', text: 'perform_work is not available, plan executor not initialized' }],
          isError: true,
        }
      }

      const result = await performWork(args.planName)

      return {
        content: [{ type: 'text', text: result.message }],
        isError: !result.success,
      }
    },
  }
}
