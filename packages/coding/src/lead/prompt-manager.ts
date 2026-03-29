// ═══════════════════════════════════════════════════════════
// PromptManager — 根据 ResourceManager 载入资源组装 System Prompt
// ═══════════════════════════════════════════════════════════
// 将 AGENTS.md 注入(agentInstructions)、用户自定义 systemPrompt、
// 工具/agent 目录组合为最终的 lead agent / subagent system prompt。

import type { LoadedResources } from '../resources/resource-manager'

export interface PromptAgentSummary {
  name: string
  description: string
  capabilities?: string[]
}

export interface PromptToolSummary {
  name: string
  description: string
  category?: string
  source?: 'builtin' | 'custom'
  /** 工具使用示例（注入 prompt 帮助 agent 理解调用方式） */
  snippet?: string
  /** 行为指南（约束工具使用规范） */
  guideline?: string
}

export interface PromptBuildOptions {
  /** 用户 / 配置级别的自定义 system prompt（最高优先级前置） */
  customSystemPrompt?: string
  /** ResourceManager 产出（覆盖实例持有的 resources） */
  resources?: LoadedResources | null
  /** 额外的角色说明（如 lead agent 独有的任务分派指南） */
  roleInstructions?: string
  /** 可委派 agent 摘要 */
  agentCatalog?: PromptAgentSummary[]
  /** 当前可见工具摘要 */
  toolCatalog?: PromptToolSummary[]
}

export interface SubagentPromptOptions {
  specSystemPrompt?: string
  resources?: LoadedResources | null
  toolCatalog?: PromptToolSummary[]
}

export interface PromptManagerOptions {
  resources?: LoadedResources | null
}

/**
 * Lead agent 的角色编排约束——综合 superpowers、deepagents、pi-mono：
 * - plan as contract
 * - isolated delegation
 * - session-aware execution
 * - strict staged review
 */
export const LEAD_ROLE_INSTRUCTIONS = `
## Role: Lead Agent

You are the **lead agent**. You are responsible for turning ambiguous requests into controlled execution.
You must stay process-driven even when the task looks simple.

You are expected to handle both:
- implementation work: coding, refactoring, debugging, testing, review
- document work: design, proposal, plan, specification, analysis

Your job is not merely to answer. Your job is to manage the work to completion.

### Core Principles
- Treat the plan as a contract.
- Prefer explicit phases over implicit improvisation.
- Delegate only when isolation or specialization improves quality.
- Never trust unverified completion claims.
- Keep context clean: coordination stays with you; execution can move to subagents.

### Phase 1: Understand And Clarify
- Identify whether the user wants implementation, investigation, review, or document production.
- Extract explicit requirements, constraints, success criteria, and deliverables.
- If essential context is missing, ask for clarification before committing to execution.
- Do not silently invent requirements.

### Phase 2: Plan
- Produce a concise plan before substantial execution.
- The plan is a contract: later work must satisfy every item or explain why not.
- Separate independent tasks from tightly coupled tasks.
- Decide explicitly whether to execute directly, delegate, or parallelize.

### Phase 3: Execute Or Delegate
- Use direct tools for local, bounded work.
- Use subagents for isolated, multi-step, or specialized tasks.
- Give subagents explicit scope, files, constraints, and verification steps.
- Prefer fresh isolated child sessions for execution tasks.
- Do not ask subagents to reconstruct missing context from scratch if you can provide it directly.

### Phase 4: Verify
- Review each deliverable in two stages:
  1. spec compliance
  2. quality and correctness
- For code: verify behavior with tests, execution, or code inspection.
- For plans/specs/proposals: verify completeness, internal consistency, and requirement coverage.
- Treat subagent output as an input artifact, not proof.

### Phase 5: Conclude
- Return a controlled final status.
- Summarize what changed or what was produced.
- Include verification performed and any remaining concerns.
- If blocked, state the blocker precisely.

### Tooling
- Prefer the smallest effective tool surface.
- Use the available tool catalog and agent catalog instead of assuming hidden capabilities.
- When writing or modifying artifacts, preserve existing architectural boundaries unless the task requires structural change.

### Status Reporting
- After finishing a user request, summarize with one of:
  - \`done\` — all plan items satisfied
  - \`done_with_concerns\` — completed but with caveats
  - \`needs_context\` — blocked on missing information
  - \`blocked\` — cannot proceed
`.trim()

export const SUBAGENT_ROLE_INSTRUCTIONS = `
## Role: Specialist Subagent

You are an isolated execution agent working on a delegated task.

### Operating Model
- You do NOT inherit the parent agent's hidden reasoning or full conversation history.
- Work only from the instructions and files available in this session.
- If requirements are incomplete or contradictory, stop guessing and return a controlled status.

### Execution
- Complete the assigned task directly and pragmatically.
- Use the narrowest tools that solve the job.
- Before returning, self-review for spec compliance first and quality second.
- If you are working on a design or plan artifact, review for requirement coverage and coherence before returning.

### Final Response Contract
- Your first line MUST be exactly one of: \`done\`, \`done_with_concerns\`, \`needs_context\`, \`blocked\`.
- After the status line, provide a concise report covering what changed, how you verified it, and any risks or missing context.
- Use \`needs_context\` when more information would unblock you.
- Use \`blocked\` when you cannot continue even with normal clarification.
`.trim()

// ═══ Internal helpers ═══

function pushSection(sections: string[], value: string | undefined): void {
  const normalized = value?.trim()
  if (normalized) {
    sections.push(normalized)
  }
}

function buildAgentCatalogSection(agentCatalog: PromptAgentSummary[] | undefined): string {
  if (!agentCatalog || agentCatalog.length === 0) return ''

  const lines = [
    '## Available Specialist Agents',
    'Delegate to these agents when their scope fits better than direct execution:',
  ]

  for (const agent of agentCatalog) {
    const capabilities = agent.capabilities && agent.capabilities.length > 0
      ? ` Capabilities: ${agent.capabilities.join(', ')}.`
      : ''
    lines.push(`- ${agent.name}: ${agent.description}.${capabilities}`)
  }

  return lines.join('\n')
}

function buildToolCatalogSection(toolCatalog: PromptToolSummary[] | undefined): string {
  if (!toolCatalog || toolCatalog.length === 0) return ''

  const buckets: Array<{ title: string; tools: PromptToolSummary[] }> = [
    { title: 'Built-in Tools', tools: toolCatalog.filter((tool) => tool.source === 'builtin') },
    { title: 'Custom Tools', tools: toolCatalog.filter((tool) => tool.source === 'custom') },
  ].filter((bucket) => bucket.tools.length > 0)

  if (buckets.length === 0) return ''

  const lines = [
    '## Tooling Surface',
    'Use direct tools when the work is local and bounded. Delegate only when isolation or parallel execution helps.',
  ]

  for (const bucket of buckets) {
    lines.push('')
    lines.push(`### ${bucket.title}`)

    for (const tool of bucket.tools.slice(0, 12)) {
      const category = tool.category ? ` [${tool.category}]` : ''
      lines.push(`- ${tool.name}${category}: ${tool.description}`)
      if (tool.snippet) {
        lines.push(`  Example: ${tool.snippet}`)
      }
      if (tool.guideline) {
        lines.push(`  Guideline: ${tool.guideline}`)
      }
    }

    if (bucket.tools.length > 12) {
      lines.push(`- ... ${bucket.tools.length - 12} more ${bucket.title.toLowerCase()} available`)
    }
  }

  // 收集开启了 guideline 的 tool，生成专属指南段落
  const guidelines = toolCatalog.filter(t => t.guideline)
  if (guidelines.length > 0) {
    lines.push('')
    lines.push('### Tool Usage Guidelines')
    for (const tool of guidelines) {
      lines.push(`**${tool.name}**: ${tool.guideline}`)
    }
  }

  return lines.join('\n')
}

// ═══ PromptManager ═══

export class PromptManager {
  private resources: LoadedResources | null

  constructor(options?: PromptManagerOptions) {
    this.resources = options?.resources ?? null
  }

  setResources(resources: LoadedResources | null): void {
    this.resources = resources
  }

  getResources(): LoadedResources | null {
    return this.resources
  }

  /**
   * 构建 lead agent 的完整 system prompt。
   *
   * 拼接顺序（对齐 pi-mono 体系）:
   * 1. customSystemPrompt（用户自定义 / 配置覆盖）
   * 2. agentInstructions（来自 AGENTS.md）
   * 3. roleInstructions（角色特化指南）
   * 4. tool/agent catalog（运行时能力摘要）
   */
  buildLeadPrompt(options: PromptBuildOptions = {}): string {
    const sections: string[] = []
    const resources = options.resources ?? this.resources

    pushSection(sections, options.customSystemPrompt)
    pushSection(sections, resources?.agentInstructions)
    pushSection(sections, options.roleInstructions)
    pushSection(sections, buildAgentCatalogSection(options.agentCatalog))
    pushSection(sections, buildToolCatalogSection(options.toolCatalog))

    return sections.join('\n\n')
  }

  /**
   * 构建 subagent 的 system prompt。
   *
   * 与 lead agent 相比：
   * - spec.systemPrompt 已由 orchestrator 的 AgentSpec 确定
   */
  buildSubagentPrompt(options: SubagentPromptOptions = {}): string {
    const sections: string[] = []
    const resources = options.resources ?? this.resources

    pushSection(sections, options.specSystemPrompt)
    pushSection(sections, resources?.agentInstructions)
    pushSection(sections, SUBAGENT_ROLE_INSTRUCTIONS)
    pushSection(sections, buildToolCatalogSection(options.toolCatalog))

    return sections.join('\n\n')
  }
}

export function createPromptManager(options?: PromptManagerOptions): PromptManager {
  return new PromptManager(options)
}
