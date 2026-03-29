import { ToolRegistry, registerBuiltinTools, createBinaryToolExecutorRegistry } from '@vitamin/tools'
import { bootstrapOrchestrator, createClarifyChannel } from '@vitamin/orchestrator'
import { SettingsManager } from '../resources/settings-manager'
import { PromptManager, LEAD_ROLE_INSTRUCTIONS } from '../lead/prompt-manager'

import type { HookRegistry } from '@vitamin/hooks'
import type { VitaminConfig } from '@vitamin/config'
import type { AgentSpec, Orchestrator, SessionFactory } from '@vitamin/orchestrator'
import type { ResourceManager } from '../resources/resource-manager'
import type { VitaminAppOptions } from './types'
import type { PromptAgentSummary, PromptToolSummary } from '../lead/prompt-manager'
import type { RegisteredTool } from '@vitamin/tools'

// ═══ Lead Prompt ═══

function toPromptToolSummary(tool: {
  name: string
  description: string
  metadata?: {
    category?: string
    builtin?: boolean
    snippet?: string
    guideline?: string
  }
}): PromptToolSummary {
  return {
    name: tool.name,
    description: tool.description,
    category: tool.metadata?.category,
    source: tool.metadata?.builtin ? 'builtin' : 'custom',
    snippet: tool.metadata?.snippet,
    guideline: tool.metadata?.guideline,
  }
}

export function summarizeToolCatalog(toolRegistry: ToolRegistry | null): PromptToolSummary[] {
  if (!toolRegistry) return []

  return toolRegistry
    .getAvailable('full')
    .map((tool) => toPromptToolSummary(tool as RegisteredTool))
}

export function summarizeAgentCatalog(agentSpecs: AgentSpec[]): PromptAgentSummary[] {
  return agentSpecs
    .filter((spec) => spec.name !== '__fallback__')
    .map((spec) => ({
      name: spec.name,
      description: spec.description,
      capabilities: spec.capabilities,
    }))
}

export function buildLeadSystemPrompt(
  params: {
    options: VitaminAppOptions
    resources: ResourceManager | null
    promptManager: PromptManager
    agentSpecs?: AgentSpec[]
    toolRegistry?: ToolRegistry | null
  },
): string {
  const { options, resources, promptManager, agentSpecs = [], toolRegistry = null } = params

  return promptManager.buildLeadPrompt({
    customSystemPrompt: options.systemPrompt,
    resources: resources?.resources ?? null,
    roleInstructions: LEAD_ROLE_INSTRUCTIONS,
    agentCatalog: summarizeAgentCatalog(agentSpecs),
    toolCatalog: summarizeToolCatalog(toolRegistry),
  })
}

// ═══ Agent Specs ═══

export function compileAgentSpecs(config: VitaminConfig | null): AgentSpec[] {
  const agentsConfig = (config as Record<string, unknown> | null)?.agents as Record<string, Record<string, unknown>> | undefined
  const disabledAgents = new Set(((config as Record<string, unknown> | null)?.disabled_agents as string[]) ?? [])
  if (!agentsConfig) return []

  const specs: AgentSpec[] = []
  for (const [name, cfg] of Object.entries(agentsConfig)) {
    if (cfg.disabled || disabledAgents.has(name)) continue
    if (!cfg.model) continue
    specs.push({
      name,
      description: cfg.description as string ?? `Agent "${name}" from config`,
      model: cfg.model as string,
      systemPrompt: cfg.system_prompt as string | undefined,
      tools: cfg.tools as string[] | undefined,
      capabilities: cfg.capabilities as string[] | undefined,
      maxToolTurns: cfg.max_tool_turns as number | undefined,
    })
  }
  return specs
}

// ═══ Tools + Orchestrator ═══

export function createAppToolRegistry(workspaceDir: string): ToolRegistry {
  const toolRegistry = new ToolRegistry()
  const binaryRegistry = createBinaryToolExecutorRegistry(workspaceDir)
  toolRegistry.setBinaryToolExecutors(binaryRegistry)
  return toolRegistry
}

export function buildFallbackAgentSpec(params: {
  options: VitaminAppOptions
  settings: SettingsManager | null
  leadSystemPrompt: string
}): AgentSpec | undefined {
  const { options, settings, leadSystemPrompt } = params
  const configModel = settings?.snapshot.model
  const resolvedModel = configModel ?? options.modelId ?? (options.model ? `${options.model.provider}/${options.model.name}` : undefined)

  return resolvedModel
    ? {
      name: '__fallback__',
      description: 'Default fallback agent — handles all tasks when no specialized agent matches.',
      model: resolvedModel,
      systemPrompt: leadSystemPrompt || undefined,
      capabilities: ['code', 'file', 'shell', 'planning'],
    }
    : undefined
}

export function bootstrapToolsAndOrchestrator(params: {
  options: VitaminAppOptions
  workspaceDir: string
  settings: SettingsManager | null
  toolRegistry: ToolRegistry
  sessionFactory: SessionFactory
  hooks: HookRegistry
  leadSystemPrompt: string
}): {
  agentSpecs: AgentSpec[]
  fallbackAgent: AgentSpec | undefined
  orchestrator: Orchestrator
} {
  const { options, workspaceDir, settings, hooks, leadSystemPrompt, toolRegistry } = params

  // Agent specs from config
  const agentSpecs = compileAgentSpecs(settings?.snapshot ?? null)

  // Fallback agent
  const fallbackAgent = buildFallbackAgentSpec({
    options,
    settings,
    leadSystemPrompt,
  })

  // Clarify channel
  const clarifyChannel = options.clarifyHandler
    ? createClarifyChannel({
      handler: async (req) => {
        const result = await options.clarifyHandler!(req)
        return { answer: result.answer }
      },
    })
    : undefined

  const { orchestrator, callbacks } = bootstrapOrchestrator({
    sessionFactory: params.sessionFactory,
    toolRegistry,
    hooks,
    agents: agentSpecs,
    fallbackAgent,
    planFileStore: options.planFileStore,
    clarifyChannel,
    reviewGate: options.reviewGate,
    retryStrategy: options.retryStrategy,
    circuitBreaker: options.circuitBreaker,
    router: options.router,
  })

  registerBuiltinTools(toolRegistry, workspaceDir, callbacks)

  // Register user custom tools
  if (options.tools) {
    for (const tool of options.tools) {
      toolRegistry.register(tool, { preset: 'full', category: 'custom' })
    }
  }

  return { agentSpecs, fallbackAgent, orchestrator }
}
