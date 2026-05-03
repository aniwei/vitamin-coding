import { z } from 'zod'

import type { AgentTool, ToolResult } from '@x-mars/agent'

const AgentListArgsSchema = z.object({
  includeDisabled: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include disabled agents in the response.'),
})

type AgentListArgs = z.infer<typeof AgentListArgsSchema>

export interface AgentListEntry {
  name: string
  description?: string
  source?: 'builtin' | 'file' | 'settings' | 'plugin' | 'unknown'
  filePath?: string
  tools?: string[]
  capabilities?: string[]
  categories?: string[]
  defaultWorkflowSlot?: string
  maxToolTurns?: number
  disabled?: boolean
  activeTaskCount?: number
  runningTaskIds?: string[]
  recentTaskIds?: string[]
  lastTaskStatus?: string
}

export type ListAgents = (options?: { includeDisabled?: boolean }) => Promise<{
  success: boolean
  agents: AgentListEntry[]
  error?: string
}>

export function createAgentList(list?: ListAgents): AgentTool<AgentListArgs> {
  return {
    name: 'agent_list',
    description:
      'List available sub-agent profiles, including file-based agents and their tool boundaries.',
    parameters: AgentListArgsSchema,
    visibility: 'always',
    readonly: true,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,

    async execute({ params }): Promise<ToolResult> {
      if (!list) {
        return {
          content: [{ type: 'text', text: 'agent_list not available' }],
          isError: true,
        }
      }

      const result = await list({ includeDisabled: params.includeDisabled })
      if (!result.success) {
        return {
          content: [{ type: 'text', text: `Failed to list agents: ${result.error}` }],
          isError: true,
        }
      }

      const agents = result.agents.filter((agent) => params.includeDisabled || !agent.disabled)
      if (agents.length === 0) {
        return {
          content: [{ type: 'text', text: 'No agents found.' }],
          details: { agents },
        }
      }

      return {
        content: [{ type: 'text', text: formatAgents(agents) }],
        details: { agents },
      }
    },
  }
}

function formatAgents(agents: AgentListEntry[]): string {
  return agents
    .map((agent) => {
      const parts = [
        `- ${agent.name}${agent.disabled ? ' (disabled)' : ''}`,
        agent.description ? `  description: ${agent.description}` : undefined,
        agent.source ? `  source: ${agent.source}` : undefined,
        agent.defaultWorkflowSlot ? `  slot: ${agent.defaultWorkflowSlot}` : undefined,
        agent.tools?.length ? `  tools: ${agent.tools.join(', ')}` : undefined,
        agent.categories?.length ? `  categories: ${agent.categories.join(', ')}` : undefined,
        agent.capabilities?.length ? `  capabilities: ${agent.capabilities.join(', ')}` : undefined,
        agent.activeTaskCount !== undefined ? `  activeTasks: ${agent.activeTaskCount}` : undefined,
        agent.runningTaskIds?.length
          ? `  runningTaskIds: ${agent.runningTaskIds.join(', ')}`
          : undefined,
        agent.lastTaskStatus ? `  lastTaskStatus: ${agent.lastTaskStatus}` : undefined,
      ]
      return parts.filter(Boolean).join('\n')
    })
    .join('\n')
}
