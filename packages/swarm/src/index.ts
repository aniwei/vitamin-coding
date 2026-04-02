// @vitamin/swarm — Agent Swarm 多 Agent 协作框架

// 核心类
export { Swarm, createSwarm } from './swarm'
export type { SwarmRunResult } from './swarm'

// 路由器
export { SwarmRouter, createRouter } from './router'

// Handoff
export { createHandoffTool, validateHandoff } from './handoff'

// 上下文
export { createSwarmContext, buildCallGraph } from './context'

// 编排模式
export {
  executeSequential,
  executeParallel,
  executeHierarchical,
  executeAgentTurn,
} from './patterns'

// 错误类型
export {
  HandoffTargetError,
  HandoffDepthError,
  HandoffNotAllowedError,
  RoutingError,
  PipelineError,
  AgentNotFoundError,
  SwarmConfigError,
} from './errors'

// 类型导出
export type {
  // Agent
  SwarmAgentId,
  SwarmAgentDef,

  // Handoff
  HandoffRequest,
  HandoffResult,

  // Routing
  RoutingStrategy,
  RoutingDecision,
  RouteRule,
  RouterConfig,

  // Patterns
  OrchestrationPattern,
  PipelineStepResult,
  ParallelTask,
  ParallelResult,
  HierarchicalTask,
  HierarchicalResult,

  // Context
  SwarmContext,

  // Turn
  SwarmTurnResult,

  // Config
  SwarmConfig,
  SwarmRunContextFactory,

  // Events
  SwarmEvent,
  SwarmEventHandler,
} from './types'
