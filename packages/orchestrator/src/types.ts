// @vitamin/orchestrator 核心类型
import type { AgentEventListener, AgentMessage, AgentTool } from '@vitamin/agent'
import type { Model, ProviderRegistry } from '@vitamin/ai'

// ═══ Agent 注册 ═══

export type AgentMode = 'primary' | 'subagent' | 'all'
export type AgentCategory = 'orchestrator' | 'specialist' | 'advisor' | 'utility' | 'exploration'
export type AgentCost = 'EXPENSIVE' | 'MODERATE' | 'CHEAP' | 'FREE'

export interface AgentPromptMetadata {
  category: AgentCategory
  cost: AgentCost
  triggers: Array<{ domain: string; trigger: string }>
  useWhen?: string[]
  avoidWhen?: string[]
  executionMode: 'sync' | 'background' | 'both'
}

export interface AgentFactory {
  (model: Model, tools: AgentTool[], options?: AgentFactoryOptions): AgentInstance
}

export interface AgentFactoryOptions {
  systemPrompt?: string
  eventListener?: AgentEventListener
  maxToolTurns?: number
  providerRegistry?: ProviderRegistry
  apiKey?: string
}

export interface AgentInstance {
  prompt(message: string): Promise<AgentResult>
  abort(): void
  on(listener: AgentEventListener): void
}

export interface AgentResult {
  messages: AgentMessage[]
  output: string
  usage: { inputTokens: number; outputTokens: number }
}

export interface AgentRegistration {
  name: string
  factory: AgentFactory
  mode: AgentMode
  metadata: AgentPromptMetadata
  modelPriority: string[]
  toolRestrictions?: { allowed?: string[]; denied?: string[] }
  disableable: boolean
  enabled: boolean
}

// ═══ 任务请求 ═══

export interface TaskRequest {
  prompt: string
  subagent?: string
  category?: string
  mode?: 'sync' | 'background'
  parentAgent?: string
  metadata?: Record<string, unknown>
  // §S7.4 error→running fallback retry 最大重试次数（默认 1）
  maxRetries?: number
}

export type TaskStatus = 'pending' | 'running' | 'completed' | 'error' | 'cancelled'

export interface TaskHandle {
  taskId: string
  status: TaskStatus
  result?: AgentResult
  error?: Error
  getStatus(): TaskStatus
  getResult(): Promise<AgentResult>
  cancel(): void
}

// ═══ 任务调度 ═══

export interface Dispatcher {
  dispatch(request: TaskRequest): Promise<TaskHandle>
}

// ═══ Plan Family ═══

export const PLAN_FAMILY = ['prometheus', 'atlas', 'momus', 'metis'] as const
export type PlanFamilyAgent = typeof PLAN_FAMILY[number]

export function isPlanFamily(agentName: string): boolean {
  return (PLAN_FAMILY as readonly string[]).includes(agentName)
}
