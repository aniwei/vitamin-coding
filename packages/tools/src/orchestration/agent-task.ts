import { z } from 'zod'

import type { AgentTool, ToolResult } from '@vitamin/agent'

import type { TaskDispatch } from './task-delegate'

const AgentTaskArgsSchema = z.object({
  agent: z.string().describe('Agent name to execute the task with (e.g. "explore", "reviewer")'),
  prompt: z.string().describe('Task description to send to the agent'),
  mode: z.enum(['sync', 'background']).optional().default('sync').describe('Execution mode'),
  sessionId: z.string().optional().describe('Optional child session ID. When used with sticky mode, later calls can reuse the same child context.'),
  sessionMode: z.enum(['ephemeral', 'sticky']).optional().default('ephemeral').describe('Child session lifecycle. ephemeral deletes the child session after the task; sticky keeps it for later reuse.'),
  slot: z.enum(['normal', 'thinking', 'compact', 'critique', 'vision']).optional().describe('Model slot to use for this task'),
})

type AgentTaskArgs = z.infer<typeof AgentTaskArgsSchema>

export function createAgentTask(
  _workspaceDir: string,
  dispatch: TaskDispatch,
): AgentTool<AgentTaskArgs> {
  return {
    name: 'agent_task',
    description: 'Run a named agent through the task runtime with retries, background execution, and optional sticky session reuse.',
    parameters: AgentTaskArgsSchema,
    visibility: 'always',

    async execute({ params }): Promise<ToolResult> {
      if (!dispatch) {
        throw new Error('agent_task function is not provided in options')
      }

      const result = await dispatch({
        prompt: params.prompt,
        subagent: params.agent,
        mode: params.mode,
        sessionId: params.sessionId,
        sessionMode: params.sessionMode,
        slot: params.slot,
      })

      if (result.success) {
        const isBackground = params.mode === 'background'
        const text = isBackground
          ? `Agent task started in background${result.id ? `: ${result.id}` : ''}${result.output ? `\n${result.output}` : ''}`
          : `Agent task completed${result.output ? `: ${result.output}` : ''}`

        return {
          content: [{ type: 'text', text }],
          details: {
            agent: params.agent,
            mode: params.mode,
            status: result.status,
            sessionId: params.sessionId,
            sessionMode: params.sessionMode,
          },
        }
      }

      return {
        content: [{ type: 'text', text: `Agent task failed: ${result.error ?? 'Unknown error'}` }],
        isError: true,
      }
    },
  }
}