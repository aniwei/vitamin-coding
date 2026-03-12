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

import type { Devtools } from '@vitamin/devtools'

// Agent 运行状态
export type AgentStatus =
  | 'idle'
  | 'streaming'
  | 'tool_executing'
  | 'completed'
  | 'error'
  | 'aborted'

export type AgentBreakpointPoint =
  | 'loop_start'
  | 'model_before'
  | 'model_after'
  | 'tool_before'
  | 'tool_after'
  | 'loop_end'
  | 'agent_error'
  | 'agent_done'

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

// Agent 状态
export interface AgentState {
  status: AgentStatus
  systemPrompt: string
  model: Model
  thinkingLevel?: ThinkingLevel
  tools: AgentTool[]
  messages: AgentMessage[]
  turnCount: number
  tokenUsage: { input: number; output: number; cacheRead: number }
  isStreaming: boolean
  currentStreamMessage: AssistantMessage | null
  pendingToolCalls: Set<string>
  error?: Error
}

// Agent 循环配置
export interface AgentLoopRuntime {
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

// Agent 工具（封装 ToolDefinition + execute）
export interface AgentTool<Args = unknown> {
  name: string
  description: string
  parameters: ZodType<Args>
  visibility?: 'always' | 'when-enabled' | 'when-requested'
  execute: (
    id: string,
    args: Args,
    signal: AbortSignal,
    onUpdate?: (update: string) => void,
  ) => Promise<ToolResult>
}

// 工具执行结果
export interface ToolResult {
  content: (TextContent | ImageContent)[]
  isError?: boolean
  metadata?: Record<string, unknown>
}

// Agent 配置
export interface AgentConfig {
  model: Model
  systemPrompt: string
  tools?: AgentTool[]
  maxToolTurns?: number
  thinkingLevel?: ThinkingLevel
  maxTokens?: number
  temperature?: number
  stream?: (
    context: StreamContext,
    signal: AbortSignal,
  ) => AsyncIterable<StreamEvent> & {
    result(): Promise<AssistantMessage>
  }
  devtools?: Devtools
}

// Agent 事件监听器
export type AgentEventListener = (event: AgentEvent) => void
