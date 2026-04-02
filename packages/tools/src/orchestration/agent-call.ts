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


export function createAgentCall(
  _projectRoot: string,
  call: CallAgent
): AgentTool<CallAgentArgs> {

  return {
    name: 'agent_call',
    description: 'Call a specific agent synchronously as an isolated collaborator for exploration, planning, or review. Use task_delegate for background, stateful, or plan-task execution.',
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
    }
  }
}
