// start-work 工具 — 启动计划执行
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const StartWorkArgsSchema = z.object({
  planName: z.string().describe('要执行的计划名称'),
})

type StartWorkArgs = z.infer<typeof StartWorkArgsSchema>

export type StartWork = (planName: string) => Promise<{ success: boolean; message: string }>

export function createStartWorkTool(startWork?: StartWork): AgentTool<StartWorkArgs> {
  return {
    name: 'start_work',
    description: '启动一个已生成的计划的执行。Atlas 将按 DAG 拓扑并行执行计划步骤。',
    parameters: StartWorkArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      if (!startWork) {
        return {
          content: [{ type: 'text', text: 'start_work is not available: plan executor not initialized' }],
          isError: true,
        }
      }

      const result = await startWork(args.planName)
      return {
        content: [{ type: 'text', text: result.message }],
        isError: !result.success,
      }
    },
  }
}
