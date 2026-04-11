// @vitamin/agent — Agent 核心

// Agent 类与工厂
export { Agent, createAgent } from './agent'

// 工具执行器
export { createToolExecutor } from './tool-executor'
export type { ToolExecutor } from './tool-executor'

// 错误类型
export { AgentLoopError, ToolExecutionError, AbortError, MaxToolTurnsError } from './errors'

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
  AgentConfig,
  AgentRunContext,
  AgentTool,
  ToolResult,
  ToolHookExecutor,
  StreamFunction,
} from './types'

// Session 事件类型（供 @vitamin/service 等中间层使用，避免循环依赖）
export type {
  AgentSessionEvent,
  AgentSessionEventType,
  AgentSessionSubscriber,
  AskUserQuestion,
} from './session-events'
