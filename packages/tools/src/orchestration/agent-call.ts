import { z } from 'zod'
import type { AgentTool, ToolResult } from '@vitamin/agent'

const CallAgentArgsSchema = z.object({
  agent: z.string().describe('Agent name (e.g. "explore", "librarian")'),
  prompt: z.string().describe('Prompt to send to the Agent'),
  mode: z.enum(['sync', 'async']).optional().default('sync').describe('Call mode, sync waits for result, async does not wait'),
  sessionId: z.string().optional().describe('Optional session ID to maintain context across calls'),
})

type CallAgentArgs = z.infer<typeof CallAgentArgsSchema>
type CallAgentOptions = {
  mode?: 'sync' | 'async'
  sessionId?: string
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
    description: 'Call a specific agent as an isolated collaborator for exploration, planning, or review. Use task_delegate for plan task execution and state updates.',
    parameters: CallAgentArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!call) {
        throw new Error('call_agent function is not provided in options')
      }

      const result = await call(params.agent, params.prompt, {
        mode: params.mode ?? 'sync',
        sessionId: params.sessionId,
      })
      
      if (result.success) {
        return { content: [{ type: 'text', text: result.output ?? '(no output)' }] }
      }

      throw new Error(result.error ?? 'Unknown error from called agent')
    }
  }
}
