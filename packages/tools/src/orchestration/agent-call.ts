import { z } from 'zod'
import type { AgentTool, ToolResult } from '@vitamin/agent'

const CallAgentArgsSchema = z.object({
  agent: z.string().describe('Agent name (e.g. "explore", "librarian")'),
  prompt: z.string().describe('Prompt to send to the Agent'),
  slot: z.enum(['normal', 'thinking', 'compact', 'critique', 'vision']).optional().describe('Model slot to use for this synchronous isolated call'),
})

type CallAgentArgs = z.infer<typeof CallAgentArgsSchema>
type CallAgentOptions = {
  slot?: 'normal' | 'thinking' | 'compact' | 'critique' | 'vision'
}

export type CallAgent = (
  agent: string, 
  prompt: string, 
  options?: CallAgentOptions
) => Promise<{
  success: boolean
  output?: string
  error?: string
}>

function createIsolatedAgentCallTool(
  name: 'agent_call' | 'review_call',
  description: string,
  call: CallAgent,
): AgentTool<CallAgentArgs> {
  return {
    name,
    description,
    parameters: CallAgentArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!call) {
        throw new Error('call_agent function is not provided in options')
      }

      const result = await call(params.agent, params.prompt, {
        slot: params.slot,
      })

      if (result.success) {
        return { content: [{ type: 'text', text: result.output ?? '(no output)' }] }
      }

      throw new Error(result.error ?? 'Unknown error from called agent')
    },
  }
}

export function createAgentCall(
  _projectRoot: string,
  call: CallAgent
): AgentTool<CallAgentArgs> {
  return createIsolatedAgentCallTool(
    'agent_call',
    'Backward-compatible alias for review_call. Call a specific agent synchronously as an isolated collaborator for exploration, planning, or review. Use agent_task or task_delegate for background, stateful, or plan-task execution.',
    call,
  )
}

export function createReviewCall(
  _projectRoot: string,
  call: CallAgent,
): AgentTool<CallAgentArgs> {
  return createIsolatedAgentCallTool(
    'review_call',
    'Ask a reviewer or collaborator agent for a synchronous isolated second opinion. Use agent_task or task_delegate for task-governed execution.',
    call,
  )
}
