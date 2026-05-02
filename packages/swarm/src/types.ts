import type { Model, ThinkingLevel } from '@vitamin/ai'
import type { AgentMessage, AgentTool, AgentRunContext } from '@vitamin/agent'

// ─── Swarm Agent 定义 ───

/** Swarm 中 Agent 的角色标识 */
export type SwarmAgentId = string

/** Agent 角色定义 — 描述一个 Swarm 成员 */
export interface SwarmAgentDef {
  /** 唯一标识 */
  id: SwarmAgentId
  /** 显示名 */
  name: string
  /** 角色描述（用于路由决策） */
  description: string
  /** System prompt */
  systemPrompt: string
  /** 模型配置（缺省时继承 Swarm 默认模型） */
  model?: Model
  /** 可用工具列表 */
  tools?: AgentTool[]
  /** 允许 handoff 到的目标 Agent ID 列表（空 = 无限制） */
  handoffTargets?: SwarmAgentId[]
  /** 最大工具轮次 */
  maxToolTurns?: number
  /** 思维级别 */
  thinkingLevel?: ThinkingLevel
  /** 温度 */
  temperature?: number
  /** 最大输出 token */
  maxTokens?: number
  /** Agent 元数据（业务自定义） */
  metadata?: Record<string, unknown>
}

// ─── Handoff ───

/** Handoff 请求：一个 Agent 将控制权转移给另一个 Agent */
export interface HandoffRequest {
  /** 发起方 Agent ID */
  from: SwarmAgentId
  /** 目标 Agent ID */
  to: SwarmAgentId
  /** Handoff 原因（注入目标 Agent 上下文） */
  reason: string
  /** 是否携带完整对话历史（默认 true） */
  carryHistory?: boolean
  /** 附加上下文消息 */
  contextMessages?: AgentMessage[]
}

/** Handoff 结果 */
export interface HandoffResult {
  /** 最终执行的 Agent ID */
  agentId: SwarmAgentId
  /** Agent 的最终响应 */
  response: SwarmTurnResult
  /** Handoff 链路 */
  chain: SwarmAgentId[]
}

// ─── Routing ───

/** 路由策略类型 */
export type RoutingStrategy =
  | 'llm' // LLM 根据 Agent 描述做选择
  | 'rule' // 基于规则（关键词/正则）
  | 'round-robin' // 轮转
  | 'random' // 随机
  | 'custom' // 自定义函数

/** 路由决策 */
export interface RoutingDecision {
  /** 选中的 Agent ID */
  agentId: SwarmAgentId
  /** 路由理由 */
  reason: string
  /** 置信度 (0-1) */
  confidence: number
}

/** 规则路由条件 */
export interface RouteRule {
  /** 匹配模式（正则或关键词数组） */
  match: RegExp | string[]
  /** 命中时路由到的 Agent ID */
  agentId: SwarmAgentId
  /** 优先级（高优先） */
  priority?: number
}

/** 路由器配置 */
export interface RouterConfig {
  strategy: RoutingStrategy
  /** LLM 路由时使用的模型 */
  routerModel?: Model
  /** 规则路由 */
  rules?: RouteRule[]
  /** 自定义路由函数 */
  customRouter?: (
    input: string,
    agents: SwarmAgentDef[],
    context: SwarmContext,
  ) => Promise<RoutingDecision>
  /** 默认 fallback Agent ID */
  fallbackAgentId?: SwarmAgentId
}

// ─── Orchestration Patterns ───

/** 编排模式 */
export type OrchestrationPattern =
  | 'handoff' // Handoff 模式 — Agent 自行决定向谁交接
  | 'sequential' // 流水线 — Agent 按顺序依次执行
  | 'parallel' // 并行扇出 — 多个 Agent 同时执行，结果聚合
  | 'hierarchical' // 层级委派 — 上级分解任务，下级执行
  | 'router' // 路由 — 每条消息路由到专属 Agent

/** 流水线步骤结果 */
export interface PipelineStepResult {
  agentId: SwarmAgentId
  output: SwarmTurnResult
  durationMs: number
}

/** 并行任务定义 */
export interface ParallelTask {
  agentId: SwarmAgentId
  input: string
}

/** 并行结果 */
export interface ParallelResult {
  tasks: Array<{
    agentId: SwarmAgentId
    output: SwarmTurnResult
    durationMs: number
    error?: Error
  }>
  totalDurationMs: number
}

/** 层级任务 */
export interface HierarchicalTask {
  description: string
  assignedTo?: SwarmAgentId
  subtasks?: HierarchicalTask[]
}

/** 层级结果 */
export interface HierarchicalResult {
  supervisorId: SwarmAgentId
  plan: HierarchicalTask[]
  results: Array<{
    task: HierarchicalTask
    agentId: SwarmAgentId
    output: SwarmTurnResult
    durationMs: number
  }>
  synthesis: SwarmTurnResult
  totalDurationMs: number
}

// ─── Swarm Context ───

/** Swarm 共享上下文 */
export interface SwarmContext {
  /** 共享变量（跨 Agent 可见） */
  variables: Map<string, unknown>
  /** 当前活跃的 Agent ID */
  activeAgentId: SwarmAgentId | null
  /** Handoff 历史 */
  handoffHistory: HandoffRequest[]
  /** 全局对话历史 */
  messages: AgentMessage[]
  /** Swarm 级别元数据 */
  metadata: Record<string, unknown>
}

// ─── Swarm Turn ───

/** 单次 Agent 执行结果 */
export interface SwarmTurnResult {
  agentId: SwarmAgentId
  messages: AgentMessage[]
  /** Agent 返回的最终文本 */
  text: string
  /** 是否请求 handoff */
  handoff?: HandoffRequest
  /** 使用的 token 量 */
  tokenUsage: { input: number; output: number; cacheRead: number }
  /** 执行时长 */
  durationMs: number
}

// ─── Swarm Config ───

/** Swarm 配置 */
export interface SwarmConfig {
  /** Swarm 名称 */
  name: string
  /** 参与的 Agent 定义列表 */
  agents: SwarmAgentDef[]
  /** 默认 LLM 模型 */
  defaultModel: Model
  /** 编排模式 */
  pattern: OrchestrationPattern
  /** 路由器配置（pattern='router' 或 'handoff' 时使用） */
  router?: RouterConfig
  /** 流水线顺序（pattern='sequential' 时使用） */
  pipeline?: SwarmAgentId[]
  /** 层级根 Agent（pattern='hierarchical' 时使用） */
  supervisorId?: SwarmAgentId
  /** 最大 handoff 深度（防无限循环） */
  maxHandoffDepth?: number
  /** 最大并行 Agent 数 */
  maxConcurrency?: number
  /** 初始入口 Agent ID */
  entryAgentId?: SwarmAgentId
  /** 创建 Agent 运行上下文的工厂函数 */
  createRunContext: SwarmRunContextFactory
}

/** Swarm 需要的 Agent 执行器 — 由宿主提供 */
export type SwarmRunContextFactory = (
  agentDef: SwarmAgentDef,
  swarmContext: SwarmContext,
  signal: AbortSignal,
) => Promise<AgentRunContext> | AgentRunContext

// ─── Swarm Events ───

/** Swarm 事件类型 */
export type SwarmEvent =
  | { type: 'swarm_start'; pattern: OrchestrationPattern; agentCount: number }
  | { type: 'swarm_end'; totalDurationMs: number }
  | { type: 'agent_start'; agentId: SwarmAgentId }
  | { type: 'agent_end'; agentId: SwarmAgentId; durationMs: number }
  | { type: 'handoff'; from: SwarmAgentId; to: SwarmAgentId; reason: string }
  | { type: 'routing_decision'; decision: RoutingDecision }
  | { type: 'parallel_fan_out'; agentIds: SwarmAgentId[] }
  | { type: 'parallel_fan_in'; completedCount: number; totalCount: number }
  | { type: 'pipeline_step'; step: number; agentId: SwarmAgentId }
  | { type: 'hierarchy_delegate'; supervisor: SwarmAgentId; worker: SwarmAgentId; task: string }
  | { type: 'error'; agentId: SwarmAgentId; error: Error }

/** Swarm 事件处理器 */
export type SwarmEventHandler = (event: SwarmEvent) => void
