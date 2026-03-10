// Agent 能力摘要生成 — 用于动态 Prompt 注入
import type { AgentRegistration } from '../types'

// 生成单个 Agent 摘要
export function buildAgentSummary(registration: AgentRegistration): string {
  const { name, metadata, toolRestrictions } = registration
  const lines = [
    `**${name}** (${metadata.category}, ${metadata.cost})`,
  ]

  if (metadata.useWhen && metadata.useWhen.length > 0) {
    lines.push(`  Use when: ${metadata.useWhen.join(', ')}`)
  }

  if (metadata.avoidWhen && metadata.avoidWhen.length > 0) {
    lines.push(`  Avoid when: ${metadata.avoidWhen.join(', ')}`)
  }

  if (toolRestrictions?.allowed) {
    lines.push(`  Tools: ${toolRestrictions.allowed.join(', ')}`)
  } else if (toolRestrictions?.denied) {
    lines.push(`  Denied tools: ${toolRestrictions.denied.join(', ')}`)
  }

  lines.push(`  Execution: ${metadata.executionMode}`)

  return lines.join('\n')
}

// 生成所有启用 Agent 的摘要
export function buildAllAgentSummaries(registrations: AgentRegistration[]): string {
  const enabled = registrations.filter((r) => r.enabled)
  if (enabled.length === 0) return ''

  const summaries = enabled.map(buildAgentSummary)
  return `## Available Agents\n\n${summaries.join('\n\n')}`
}
