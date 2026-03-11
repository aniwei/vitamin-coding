// @vitamin/agent — Agent 核心

// Agent 类
export { Agent } from './agent'
export { createAgent } from './agent'

// Agent 工厂（带 ProviderRegistry 便捷创建）
export { createAgent as createAgentWithRegistry } from './agent-factory'
export type { AgentFactoryConfig } from './agent-factory'

// Agent 循环
export { agentLoop } from './agent-loop'
export type { StreamFunction, AgentLoopOptions } from './agent-loop'

// 工具执行器
export { createToolExecutor } from './tool-executor'
export type { ToolExecutor, ToolHookExecutor } from './tool-executor'

// 记忆管理
export { MemoryManager, createMemoryManager } from './memory'
export type { MemoryEntry, MemorySummary, MemoryManagerConfig } from './memory'

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
  AgentLoopDebugger,
  AgentMode,
  AgentEvent,
  ToolCallEvent,
  CustomAgentMessages,
  AgentMessage,
  AgentState,
  AgentLoopConfig,
  AgentTool,
  ToolResult,
  AgentConfig,
  AgentEventListener,
} from './types'
