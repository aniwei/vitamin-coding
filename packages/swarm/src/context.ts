import type { SwarmAgentDef, SwarmContext } from './types'

/** 创建初始 SwarmContext */
export function createSwarmContext(
  initialVariables?: Record<string, unknown>,
): SwarmContext {
  const variables = new Map<string, unknown>()

  if (initialVariables) {
    for (const [key, value] of Object.entries(initialVariables)) {
      variables.set(key, value)
    }
  }

  return {
    variables,
    activeAgentId: null,
    handoffHistory: [],
    messages: [],
    metadata: {},
  }
}

/** 获取 Swarm 中 Agent 的调用图（用于注入共享上下文） */
export function buildCallGraph(
  agents: SwarmAgentDef[],
  activeAgentId: string | null,
  context: SwarmContext,
): string {
  const lines: string[] = ['## Swarm Call Graph']

  for (const agent of agents) {
    const isActive = agent.id === activeAgentId
    const marker = isActive ? ' (active)' : ''
    lines.push(`- ${agent.id}: ${agent.name}${marker}`)

    if (agent.handoffTargets && agent.handoffTargets.length > 0) {
      lines.push(`  handoff targets: [${agent.handoffTargets.join(', ')}]`)
    }
  }

  if (context.handoffHistory.length > 0) {
    lines.push('')
    lines.push('## Handoff History')
    for (const h of context.handoffHistory) {
      lines.push(`- ${h.from} → ${h.to}: ${h.reason}`)
    }
  }

  return lines.join('\n')
}
