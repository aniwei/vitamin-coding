import { z } from 'zod'
import type { AgentTool, ToolResult } from '@vitamin/agent'

const CallAgentArgsSchema = z.object({
  agent: z.string().describe('Agent name (e.g. "explore", "librarian")'),
  prompt: z.string().describe('Prompt to send to the Agent'),
  mode: z.enum(['sync', 'async']).optional().default('sync').describe('Call mode, sync waits for result, async does not wait'),
  sessionID: z.string().optional().describe('Optional session ID to maintain context across calls'),
})

type CallAgentArgs = z.infer<typeof CallAgentArgsSchema>
type CallAgentOptions = {
  mode?: 'sync' | 'async'
  sessionID?: string
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

interface CallAgentToolOptions {
  call?: CallAgent
}

export function createCallAgent(
  _projectRoot: string,
  options: CallAgentToolOptions
): AgentTool<CallAgentArgs> {
  const { call } = options

  return {
    name: 'agent_call',
    description: 'Call a specific Agent with a prompt and wait for the result. Useful for leveraging capabilities of other Agents.',
    parameters: CallAgentArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      if (!call) {
        throw new Error('call_agent function is not provided in options')
      }

      const result = await call(args.agent, args.prompt, {
        mode: args.mode ?? 'sync',
        sessionID: args.sessionID,
      })
      
      if (result.success) {
        return { content: [{ type: 'text', text: result.output ?? '(no output)' }] }
      }

      return {
        content: [{ type: 'text', text: `Agent ${args.agent} failed: ${result.error ?? 'unknown error'}` }],
        isError: true,
        details: {
          error: result.error,
        }
      }
    },
  }
}
