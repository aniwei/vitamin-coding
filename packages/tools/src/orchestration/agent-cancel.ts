import { z } from 'zod'

import type { AgentTool, ToolResult } from '@x-mars/agent'

const AgentCancelArgsSchema = z.object({
  agent: z.string().min(1).describe('Sub-agent name whose active tasks should be cancelled.'),
  includePending: z
    .boolean()
    .optional()
    .default(false)
    .describe('Also cancel pending tasks for this agent. Defaults to false.'),
})

type AgentCancelArgs = z.infer<typeof AgentCancelArgsSchema>

export interface AgentCancelResult {
  success: boolean
  agent: string
  cancelled: string[]
  skipped: Array<{ id: string; status: string; reason: string }>
  error?: string
}

export type CancelAgent = (
  agent: string,
  options?: { includePending?: boolean },
) => Promise<AgentCancelResult>

export function createAgentCancel(cancel?: CancelAgent): AgentTool<AgentCancelArgs> {
  return {
    name: 'agent_cancel',
    description: 'Cancel active tasks for a named sub-agent.',
    parameters: AgentCancelArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!cancel) {
        return {
          content: [{ type: 'text', text: 'agent_cancel not available' }],
          isError: true,
        }
      }

      const result = await cancel(params.agent, { includePending: params.includePending })
      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to cancel agent ${params.agent}: ${result.error ?? 'unknown error'}`,
            },
          ],
          details: result as unknown as Record<string, unknown>,
          isError: true,
        }
      }

      const lines = [
        `Agent ${result.agent} cancel completed.`,
        `Cancelled: ${result.cancelled.length ? result.cancelled.join(', ') : 'none'}`,
      ]
      if (result.skipped.length) {
        lines.push(
          `Skipped: ${result.skipped
            .map((item) => `${item.id} (${item.status}: ${item.reason})`)
            .join(', ')}`,
        )
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        details: result as unknown as Record<string, unknown>,
        isError: false,
      }
    },
  }
}
