// @vitamin/agent — Agent 核心

// Agent 类
export { Agent } from './agent'
export { createAgent } from './agent'

// Agent 工厂（带 ProviderRegistry 便捷创建）
export { createAgent as createAgentWithRegistry } from './agent-factory'
export type { AgentFactoryOptions } from './agent-factory'

// Agent 循环
export type { StreamFunction } from './work-loop'

// 工具执行器
export { createToolExecutor } from './tool-executor'
export type { ToolExecutor, ToolHookExecutor } from './tool-executor'

// 错误类型
export {
  AgentLoopError,
  ToolExecutionError,
  AbortError,
  MaxToolTurnsError,
} from './errors'

// 核心类型
export type {
  AgentStatus,
  AgentBreakpointPoint,
  AgentDebugSnapshot,
  AgentMode,
  AgentEvent,
  ToolCallEvent,
  ToolCallContext,
  CustomAgentMessages,
  AgentMessage,
  AgentState,
  AgentRunContext,
  AgentTool,
  ToolResult,
  AgentOptions,
  AgentLoopContext,
} from './types'

// Session 事件类型（供 @vitamin/service 等中间层使用，避免循环依赖）
export type {
  AgentSessionEvent,
  AgentSessionEventType,
  AgentSessionSubscriber,
  AskUserQuestion,
} from './session-events'
