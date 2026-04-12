// clarify_request 工具 — subagent 向父任务请求补充说明
import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

const ClarifyRequestArgsSchema = z.object({
  taskId: z.string().describe('Task ID of the current task requesting clarification'),
  question: z.string().describe('A clear, specific question about what information is needed'),
  reason: z
    .enum(['missing_context', 'conflicting_constraints', 'approval_needed'])
    .optional()
    .default('missing_context')
    .describe('Reason for requesting clarification'),
})

type ClarifyRequestArgs = z.infer<typeof ClarifyRequestArgsSchema>
type ClarifyEscalation = 'lead_agent' | 'user' | 'planner'

export type ClarifyRequest = (args: {
  taskId: string
  question: string
  reason?: 'missing_context' | 'conflicting_constraints' | 'approval_needed'
}) => Promise<{
  success: boolean
  answer?: string
  escalation?: ClarifyEscalation
  error?: string
}>

export function createClarifyRequest(
  _projectRoot: string,
  clarify?: ClarifyRequest,
): AgentTool<ClarifyRequestArgs> {
  return {
    name: 'clarify_request',
    description:
      'Request clarification from the parent task or lead agent. Returns the answer or an escalation.',
    parameters: ClarifyRequestArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!clarify) {
        return {
          content: [
            {
              type: 'text',
              text: 'clarify_request not available — ClarifyChannel not configured in orchestrator.',
            },
          ],
          isError: true,
        }
      }

      const result = await clarify({
        taskId: params.taskId,
        question: params.question,
        reason: params.reason,
      })

      if (result.success) {
        const parts = [`Answer: ${result.answer ?? '(no answer provided)'}`]
        if (result.escalation) {
          parts.push(`Escalation: ${result.escalation}`)
        }
        return {
          content: [{ type: 'text', text: parts.join('\n') }],
          details: { escalation: result.escalation },
        }
      }

      return {
        content: [{ type: 'text', text: result.error ?? 'Clarification request failed' }],
        isError: true,
      }
    },
  }
}
