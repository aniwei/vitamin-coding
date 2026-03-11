// background-output 工具 — 获取后台任务输出
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const BackgroundOutputArgsSchema = z.object({
  taskId: z.string().describe('后台任务 ID'),
})

type BackgroundOutputArgs = z.infer<typeof BackgroundOutputArgsSchema>

export type GetBackgroundOutput = (taskId: string) => Promise<{
  status: string
  output?: string
  error?: string
}>

export function createBackgroundOutputTool(
  getOutput?: GetBackgroundOutput,
): AgentTool<BackgroundOutputArgs> {
  return {
    name: 'background_output',
    description: '获取后台任务的当前状态和输出。',
    parameters: BackgroundOutputArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      if (!getOutput) {
        return {
          content: [{ type: 'text', text: 'background_output not available: background manager not initialized' }],
          isError: true,
        }
      }

      const result = await getOutput(args.taskId)
      const text = [
        `Task: ${args.taskId}`,
        `Status: ${result.status}`,
        result.output ? `\nOutput:\n${result.output}` : '',
        result.error ? `\nError:\n${result.error}` : '',
      ].filter(Boolean).join('\n')

      return { content: [{ type: 'text', text }] }
    },
  }
}
