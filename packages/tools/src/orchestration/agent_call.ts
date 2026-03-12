import { z } from 'zod'
import type { AgentTool, ToolResult } from '@vitamin/agent'

const CallAgentArgsSchema = z.object({
  agent: z.string().describe('Agent 名称（如 "explore", "oracle", "librarian"）'),
  prompt: z.string().describe('发送给 Agent 的 prompt'),
})

type CallAgentArgs = z.infer<typeof CallAgentArgsSchema>

export type CallAgent = (agent: string, prompt: string) => Promise<{
  success: boolean
  output?: string
  error?: string
}>

interface CallAgentToolOptions {
  projectRoot: string
  call?: CallAgent
}

export function createCallAgent(options: CallAgentToolOptions): AgentTool<CallAgentArgs> {
  const { call } = options

  return {
    name: 'agent_call',
    description: '直接调用指定 Agent 并等待结果。适用于需要特定 Agent 能力的场景。',
    parameters: CallAgentArgsSchema,
    visibility: 'always',

    async execute(_id, args, _signal): Promise<ToolResult> {
      if (!call) {
        return {
          content: [{ type: 'text', text: 'call_agent not available, agent system not initialized' }],
          isError: true,
        }
      }

      const result = await call(args.agent, args.prompt)
      if (result.success) {
        return { content: [{ type: 'text', text: result.output ?? '(no output)' }] }
      }

      return {
        content: [{ type: 'text', text: `Agent ${args.agent} failed: ${result.error ?? 'unknown error'}` }],
        isError: true,
      }
    },
  }
}
