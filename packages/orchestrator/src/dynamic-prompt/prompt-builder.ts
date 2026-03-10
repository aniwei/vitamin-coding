// 动态 Prompt 构建器 — §S7.6 三表注入
// 1. Delegation Table: | Agent | Category | Cost | When to Use |
// 2. Key Triggers: "refactor|redesign" → prometheus
// 3. Tool Selection Table: | Tool | Description | Typical Agent |
import type { AgentRegistration } from '../types'

// ═══ Delegation Table ═══

interface DelegationRow {
  agent: string
  category: string
  cost: string
  whenToUse: string
}

export function buildDelegationTable(registrations: AgentRegistration[]): string {
  const enabled = registrations.filter((r) => r.enabled)
  if (enabled.length === 0) return ''

  const rows: DelegationRow[] = enabled.map((r) => ({
    agent: r.name,
    category: r.metadata.category,
    cost: r.metadata.cost,
    whenToUse: r.metadata.useWhen?.join(', ') ?? '',
  }))

  const header = '| Agent | Category | Cost | When to Use |'
  const separator = '|-------|----------|------|-------------|'
  const body = rows
    .map((r) => `| ${r.agent} | ${r.category} | ${r.cost} | ${r.whenToUse} |`)
    .join('\n')

  return `## Delegation Table\n${header}\n${separator}\n${body}`
}

// ═══ Key Triggers ═══

interface TriggerEntry {
  pattern: string
  agent: string
  domain: string
}

export function buildKeyTriggers(registrations: AgentRegistration[]): string {
  const enabled = registrations.filter((r) => r.enabled)
  if (enabled.length === 0) return ''

  const entries: TriggerEntry[] = []
  for (const reg of enabled) {
    for (const trigger of reg.metadata.triggers) {
      entries.push({
        pattern: trigger.trigger,
        agent: reg.name,
        domain: trigger.domain,
      })
    }
  }

  if (entries.length === 0) return ''

  const lines = entries
    .map((e) => `- \`${e.pattern}\` → **${e.agent}** (${e.domain})`)
    .join('\n')

  return `## Key Triggers\n${lines}`
}

// ═══ Tool Selection Table ═══

interface ToolRow {
  tool: string
  description: string
  typicalAgent: string
}

// 内置工具与典型 Agent 映射
const TOOL_AGENT_MAP: Record<string, string> = {
  read: 'all agents',
  write: 'hephaestus, sisyphus',
  edit: 'hephaestus, sisyphus',
  bash: 'hephaestus, sisyphus',
  grep: 'explore, oracle',
  glob: 'explore',
  find: 'explore',
  ls: 'explore',
  'ast-grep': 'explore, oracle',
  'delegate-task': 'central-secretariat',
}

export function buildToolSelectionTable(
  tools: Array<{ name: string; description: string }>,
): string {
  if (tools.length === 0) return ''

  const rows: ToolRow[] = tools.map((t) => ({
    tool: t.name,
    description: t.description.length > 60
      ? `${t.description.slice(0, 57)}...`
      : t.description,
    typicalAgent: TOOL_AGENT_MAP[t.name] ?? 'any',
  }))

  const header = '| Tool | Description | Typical Agent |'
  const separator = '|------|-------------|---------------|'
  const body = rows
    .map((r) => `| ${r.tool} | ${r.description} | ${r.typicalAgent} |`)
    .join('\n')

  return `## Tool Selection\n${header}\n${separator}\n${body}`
}

// ═══ 完整 Prompt 构建 ═══

export interface PromptBuilderInput {
  registrations: AgentRegistration[]
  tools: Array<{ name: string; description: string }>
}

export function buildDynamicPrompt(input: PromptBuilderInput): string {
  const sections = [
    buildDelegationTable(input.registrations),
    buildKeyTriggers(input.registrations),
    buildToolSelectionTable(input.tools),
  ].filter(Boolean)

  if (sections.length === 0) return ''

  return `# Agent Delegation Reference\n\n${sections.join('\n\n')}`
}
