import type {
  AssistantMessage,
  ImageContent,
  Message,
  Model,
  StreamContext,
  StreamEvent,
  TextContent,
  ThinkingLevel,
  ZodType,
} from '@vitamin/ai'

import type { Devtools, BreakpointPoint } from '@vitamin/devtools'
import type { ToolHookExecutor } from './tool-executor'

// Agent 运行状态
export type AgentStatus =
  | 'idle'
  | 'streaming'
  | 'tool_executing'
  | 'completed'
  | 'error'
  | 'aborted'

export type AgentBreakpointPoint = BreakpointPoint

export interface AgentDebugSnapshot {
  turn: number
  point: AgentBreakpointPoint
  frameDepth: number
  messagesCount: number
  lastToolName?: string
  tokenUsage?: { input: number; output: number }
}

// Agent 模式
export type AgentMode = 'primary' | 'subagent' | 'all'

// Agent 事件（细粒度，供 Hook/Extension 订阅）
// 15 种事件类型，完整覆盖 Agent 生命周期
export type AgentEvent =
  | { type: 'status_change'; from: AgentStatus; to: AgentStatus }
  | { type: 'turn_start'; turnIndex: number }
  | { type: 'turn_end'; turnIndex: number; message: AssistantMessage }
  | { type: 'stream_event'; event: StreamEvent }
  | { type: 'streaming_start'; model: string }
  | { type: 'streaming_end'; model: string; stopReason: string }
  | { type: 'tool_call_start'; toolCall: ToolCallEvent }
  | { type: 'tool_call_end'; toolCall: ToolCallEvent; result: ToolResult }
  | { type: 'tool_result_received'; toolCallId: string; isError: boolean }
  | { type: 'messages_updated'; count: number }
  | { type: 'steering_injected'; messages: AgentMessage[] }
  | { type: 'follow_up_start'; messages: AgentMessage[] }
  | { type: 'error'; error: Error }
  | { type: 'abort' }
  | { type: 'compaction_needed'; tokenCount: number; threshold: number }

// 工具调用事件信息
export interface ToolCallEvent {
  id: string
  name: string
  arguments: Record<string, unknown>
}

// 可扩展消息类型（declaration merging）
// biome-ignore lint/suspicious/noEmptyInterface: 需要空接口供应用层通过 declaration merging 扩展
export interface CustomAgentMessages {
  // 应用层通过 declaration merging 扩展
}
export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages]

// Agent 运行时状态（纯执行快照，不持有 messages/model/tools）
export interface AgentState {
  status: AgentStatus
  turnCount: number
  tokenUsage: { input: number; output: number; cacheRead: number }
  isStreaming: boolean
  currentStreamMessage: AssistantMessage | null
  pendingToolCalls: Set<string>
  error?: Error
}

// Agent 运行上下文 — 每次 run() 由调用方构建传入
export interface AgentRunContext {
  model: Model
  systemPrompt: string
  messages: AgentMessage[]
  tools: AgentTool[]
  toolHookExecutor?: ToolHookExecutor
  agentName?: string
  sessionId?: string
  // AgentMessage[] → LLM Message[] 转换
  convertToLLM?: (messages: AgentMessage[]) => Message[] | Promise<Message[]>
  // 上下文转换（压缩/裁剪/注入）— 由外部 MemoryManager 驱动
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>
  // 最大连续工具调用轮次（安全阀）
  maxToolTurns?: number
  // 思维级别
  thinkingLevel?: ThinkingLevel
  // 最大输出 token
  maxTokens?: number
  // 温度
  temperature?: number
  // 开发工具
  devtools?: Devtools
}

// Agent 循环配置（内部使用，由 Agent.run() 从 AgentRunContext 构建）
export interface AgentLoopContext {
  model: Model
  systemPrompt: string
  // AgentMessage[] → LLM Message[] 转换
  convertToLLM: (messages: AgentMessage[]) => Message[] | Promise<Message[]>
  
  // 上下文转换（压缩/裁剪/注入）
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>
  
  // Steering 消息获取
  getSteeringMessages?: () => Promise<AgentMessage[]>
  
  // FollowUp 消息获取
  getFollowUpMessages?: () => Promise<AgentMessage[]>
  
  // 最大连续工具调用轮次（安全阀）
  maxToolTurns?: number
  
  // 思维级别
  thinkingLevel?: ThinkingLevel
  
  // 最大输出 token
  maxTokens?: number
  
  // 温度
  temperature?: number

  // 开发工具
  devtools?: Devtools
}

// 工具调用上下文（参考 Hono Context 模式）
export interface ToolCallContext<Params = unknown> {
  id: string
  params: Params
  signal: AbortSignal
  onUpdate?: (update: string) => void
}

// Agent 工具（封装 ToolDefinition + execute）
export interface AgentTool<Params = unknown> {
  name: string
  description: string
  parameters: ZodType<Params>
  visibility?: 'always' | 'when-enabled' | 'when-requested'
  execute: (ctx: ToolCallContext<Params>) => Promise<ToolResult>
}

// 工具执行结果
export interface ToolResult {
  content: (TextContent | ImageContent)[]
  isError?: boolean
  details?: Record<string, unknown>
}

// Agent 配置（创建时仅需 stream 函数，其余通过 run() 传入）
export interface AgentConfig {
  /** stream 函数（LLM 调用实现） */
  stream?: (
    context: StreamContext,
    signal: AbortSignal,
  ) => AsyncIterable<StreamEvent> & {
    result(): Promise<AssistantMessage>
  }
  devtools?: Devtools
}
