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
import type { Logger } from '@vitamin/shared'
import type { Devtools, BreakpointPoint } from '@vitamin/devtools'

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

// ── 从 AgentEvent 自动推导的工具类型 ──────────────────────────────────────────

export type AgentEventType = AgentEvent['type']

export type AgentEventOf<T extends AgentEventType> = Extract<AgentEvent, { type: T }>

export type AgentEventPayload<T extends AgentEventType> = Omit<AgentEventOf<T>, 'type'>

// TypedEventEmitter 的事件映射，从 AgentEvent union 推导
export type AgentEvents = {
  [K in AgentEventType]: keyof AgentEventPayload<K> extends never
    ? () => void
    : (payload: AgentEventPayload<K>) => void
} & import('@vitamin/shared').Events

// 工具调用事件信息
export interface ToolCallEvent {
  id: string
  name: string
  arguments: Record<string, unknown>
}

// 工具调用上下文（参考 Hono Context 模式）
export interface ToolCallContext<Params = unknown> {
  id: string
  params: Params
  signal: AbortSignal
  sessionId?: string
  agentName?: string
  onUpdate?: (update: string) => void
}

// 工具执行结果
export interface ToolResult {
  content: (TextContent | ImageContent)[]
  isError?: boolean
  details?: Record<string, unknown>
}

// Agent 工具（封装 ToolDefinition + execute）
export interface AgentTool<Params = unknown> {
  name: string
  description: string
  parameters: ZodType<Params>
  visibility?: 'always' | 'when-enabled' | 'when-requested'
  /** 标记为只读工具，可与其他只读工具并发执行 */
  readonly?: boolean
  execute: (ctx: ToolCallContext<Params>) => Promise<ToolResult>
}

export interface CustomAgentMessages {
  // 应用层通过 declaration merging 扩展
}
export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages]

// Agent 运行时状态（纯执行快照）
export interface AgentState {
  status: AgentStatus
  turnCount: number
  tokenUsage: { input: number; output: number; cacheRead: number }
  isStreaming: boolean
  currentStreamMessage: AssistantMessage | null
  error?: Error
}

// Stream 函数类型 — Agent 与 LLM 调用之间的唯一契约接口
// Agent 只知道这个接口，不知道背后是哪家 LLM
export type StreamFunction = (
  context: StreamContext,
  signal: AbortSignal,
) => AsyncIterable<StreamEvent> & { result(): Promise<AssistantMessage> }

// 工具 Hook 执行器接口
export interface ToolHookExecutor {
  executeBeforeHooks(input: {
    toolName: string
    toolCallId: string
    args: Record<string, unknown>
    agentName: string
    sessionId: string
  }): Promise<{ args: Record<string, unknown>; cancelled: boolean; cancelReason?: string }>

  executeAfterHooks(input: {
    toolName: string
    toolCallId: string
    args: Record<string, unknown>
    result: ToolResult
    agentName: string
    sessionId: string
    durationMs: number
  }): Promise<{ result: ToolResult; metadata: Record<string, unknown> }>
}

// Agent 构造配置 — 创建时确定的基础设施与身份，在所有 run() 间共享
export interface AgentConfig {
  stream: StreamFunction
  logger: Logger
  maxToolTurns?: number
  agentName?: string
  sessionId?: string
  toolHookExecutor?: ToolHookExecutor
  devtools?: Devtools
  approval?: (toolName: string, args: Record<string, unknown>, reason: string) => Promise<boolean>
}

// Agent 执行上下文 — 每次 run() 由调用方传入，描述本次执行内容
export interface AgentRunContext {
  model: Model
  systemPrompt: string
  messages: AgentMessage[]
  tools: AgentTool[]
  thinkingLevel: ThinkingLevel
  maxTokens?: number
  temperature?: number
  // AgentMessage[] → LLM Message[] 转换
  convertToLLM?: (messages: AgentMessage[]) => Message[] | Promise<Message[]>
  // 上下文转换（压缩/裁剪/注入）— 由外部 MemoryManager 驱动
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>
}
