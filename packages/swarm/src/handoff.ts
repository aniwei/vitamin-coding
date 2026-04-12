import type { AgentTool, ToolResult } from '@vitamin/agent'
import type { ZodType } from '@vitamin/ai'
import { z } from 'zod'
import type { HandoffRequest, SwarmAgentDef, SwarmAgentId } from './types'

/**
 * 创建 handoff 工具 — 注入到每个 SwarmAgent 的工具列表中，
 * 允许 Agent 通过工具调用发起 handoff。
 *
 * 灵感来自 OpenAI Swarm 的 handoff 模式：
 * Agent 在对话过程中自行决定何时、向谁交接控制权。
 */
export function createHandoffTool(
  currentAgentId: SwarmAgentId,
  availableTargets: SwarmAgentDef[],
  onHandoff: (request: HandoffRequest) => void,
): AgentTool {
  const targetDescriptions = availableTargets
    .map((t) => `- "${t.id}": ${t.name} — ${t.description}`)
    .join('\n')

  const targetIds = availableTargets.map((t) => t.id)

  return {
    name: 'handoff_to_agent',
    description: `Transfer control to another agent in the swarm. Available targets:\n${targetDescriptions}`,
    parameters: z.object({
      target_agent_id: z
        .string()
        .describe(`The ID of the agent to hand off to. Must be one of: ${targetIds.join(', ')}`),
      reason: z
        .string()
        .describe('Why you are transferring to this agent — will be provided as context.'),
      summary: z
        .string()
        .optional()
        .describe('Optional summary of work done so far to provide context to the target agent.'),
    }) as ZodType,
    readonly: true,
    execute: async (ctx): Promise<ToolResult> => {
      const { target_agent_id, reason, summary } = ctx.params as {
        target_agent_id: string
        reason: string
        summary?: string
      }

      if (!targetIds.includes(target_agent_id)) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid target agent "${target_agent_id}". Available targets: ${targetIds.join(', ')}`,
            },
          ],
          isError: true,
        }
      }

      const request: HandoffRequest = {
        from: currentAgentId,
        to: target_agent_id,
        reason: summary ? `${reason}\n\nContext: ${summary}` : reason,
        carryHistory: true,
      }

      onHandoff(request)

      return {
        content: [
          {
            type: 'text',
            text: `Handoff initiated to "${target_agent_id}". Reason: ${reason}`,
          },
        ],
      }
    },
  }
}

/** 解析 handoff 请求是否有效 */
export function validateHandoff(
  request: HandoffRequest,
  agents: Map<string, SwarmAgentDef>,
): { valid: boolean; error?: string } {
  const fromAgent = agents.get(request.from)
  const toAgent = agents.get(request.to)

  if (!fromAgent) {
    return { valid: false, error: `Source agent "${request.from}" not found` }
  }

  if (!toAgent) {
    return { valid: false, error: `Target agent "${request.to}" not found` }
  }

  // 检查 handoff 目标是否在允许列表中
  if (
    fromAgent.handoffTargets &&
    fromAgent.handoffTargets.length > 0 &&
    !fromAgent.handoffTargets.includes(request.to)
  ) {
    return {
      valid: false,
      error: `Agent "${request.from}" is not allowed to handoff to "${request.to}". Allowed: [${fromAgent.handoffTargets.join(', ')}]`,
    }
  }

  return { valid: true }
}
