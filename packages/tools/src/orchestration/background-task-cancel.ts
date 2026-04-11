import { z } from 'zod'
import type { AgentTool, ToolResult } from '@vitamin/agent'

const BackgroundCancelArgsSchema = z.object({
  id: z.string().describe('Background task ID to cancel'),
})

type BackgroundCancelArgs = z.infer<typeof BackgroundCancelArgsSchema>

export type CancelBackground = (id: string) => Promise<{
  success: boolean
  error?: string
}>

export function createBackgroundCancelTool(
  cancel?: CancelBackground,
): AgentTool<BackgroundCancelArgs> {
  return {
    name: 'background_cancel',
    description: 'Cancel a running background task.',
    parameters: BackgroundCancelArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!cancel) {
        throw new Error('cancel function is not provided in options')
      }

      const cancelled = await cancel(params.id)
      if (cancelled.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Task ${params.id} cancelled successfully`,
            },
          ],
          isError: false,
        }
      }

      return {
        content: [{ type: 'text', text: cancelled.error ?? `Failed to cancel task ${params.id}` }],
        isError: true,
      }
    },
  }
}
