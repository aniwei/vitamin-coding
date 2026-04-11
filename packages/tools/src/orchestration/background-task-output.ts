import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const BackgroundOutputArgsSchema = z.object({
  id: z.string().describe('Background task ID to get output for'),
})

type BackgroundOutputArgs = z.infer<typeof BackgroundOutputArgsSchema>

export type GetBackgroundOutput = (id: string) => Promise<{
  status: string
  success: boolean
  output?: string
  error?: string
}>

export function createBackgroundOutputTool(
  output?: GetBackgroundOutput,
): AgentTool<BackgroundOutputArgs> {
  return {
    name: 'background_output',
    description: 'Get the current status and output of a background task by its ID.',
    parameters: BackgroundOutputArgsSchema,
    visibility: 'always',
    readonly: true,

    async execute({ params }): Promise<ToolResult> {
      if (!output) {
        throw new Error('output function is not provided in options')
      }

      const result = await output(params.id)
      if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Status: ${result.status}\nOutput:\n${result.output ?? '(no output)'}`,
            },
          ],
          details: {
            status: result.status,
          },
        }
      }

      return {
        content: [
          { type: 'text', text: result.error ?? `Failed to get output for task ${params.id}` },
        ],
        isError: true,
      }
    },
  }
}
