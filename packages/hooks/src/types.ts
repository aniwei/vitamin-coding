// @vitamin/hooks 核心类型
import type { AgentMessage, AgentTool, ToolResult } from '@vitamin/agent'

// ═══ 18 种 Hook 时机 ═══

export type HookTiming =
  // 会话类 (chat.message 生命周期)
  | 'chat.message.before'
  | 'chat.message.after'
  // 工具 (tool.execute 生命周期)
  | 'tool.execute.before'
  | 'tool.execute.after'
  // 消息变换
  | 'messages.transform'
  // 参数调整
  | 'chat.params'
  // 会话事件
  | 'session.created'
  | 'session.deleted'
  | 'session.idle'
  | 'session.error'
  // 流式事件
  | 'stream.start'
  | 'stream.end'
  // 压缩事件
  | 'compaction.before'
  | 'compaction.after'
  // 后台任务事件
  | 'background.start'
  | 'background.end'
  // 扩展事件
  | 'extension.loaded'
  | 'extension.error'

export interface ChatMessageInput {
  message: AgentMessage
  sessionId: string
  isFirstMessage: boolean
  metadata: Record<string, unknown>
}

export interface ChatMessageOutput {
  message: AgentMessage
  cancelled: boolean
  metadata: Record<string, unknown>
}

export interface ToolExecuteBeforeInput {
  toolName: string
  toolCallId: string
  arguments: Record<string, unknown>
  agentName: string
  sessionId: string
}

export interface ToolExecuteBeforeOutput {
  arguments: Record<string, unknown>
  cancelled: boolean
  cancelReason?: string
}

export interface ToolExecuteAfterInput {
  toolName: string
  toolCallId: string
  arguments: Record<string, unknown>
  result: ToolResult
  agentName: string
  sessionId: string
  durationMs: number
}

export interface ToolExecuteAfterOutput {
  result: ToolResult
  metadata: Record<string, unknown>
}

export interface MessagesTransformInput {
  messages: AgentMessage[]
  tools: AgentTool[]
  agentName: string
  sessionId: string
}

export interface MessagesTransformOutput {
  messages: AgentMessage[]
}

export interface ChatParamsInput {
  model: string
  provider: string
  temperature?: number
  maxTokens?: number
  thinkingLevel?: string
}

export interface ChatParamsOutput {
  temperature?: number
  maxTokens?: number
  thinkingLevel?: string
  metadata: Record<string, unknown>
}

export interface SessionEventInput {
  sessionId: string
  metadata: Record<string, unknown>
}

// Hook 时机 → 载荷类型映射
export interface HookPayloadMap {
  'chat.message.before': { input: ChatMessageInput; output: ChatMessageOutput }
  'chat.message.after': { input: ChatMessageInput; output: ChatMessageOutput }
  'tool.execute.before': { input: ToolExecuteBeforeInput; output: ToolExecuteBeforeOutput }
  'tool.execute.after': { input: ToolExecuteAfterInput; output: ToolExecuteAfterOutput }
  'messages.transform': { input: MessagesTransformInput; output: MessagesTransformOutput }
  'chat.params': { input: ChatParamsInput; output: ChatParamsOutput }
  'session.created': { input: SessionEventInput; output: void }
  'session.deleted': { input: SessionEventInput; output: void }
  'session.idle': { input: SessionEventInput; output: void }
  'session.error': { input: SessionEventInput & { error: Error }; output: void }
  'stream.start': { input: { sessionId: string; model: string }; output: void }
  'stream.end': { input: { sessionId: string; model: string; stopReason: string }; output: void }
  'compaction.before': { input: { sessionId: string; messageCount: number }; output: void }
  'compaction.after': { input: { sessionId: string; retainedCount: number }; output: void }
  'background.start': { input: { taskId: string; agentName: string }; output: void }
  'background.end': { input: { taskId: string; agentName: string; success: boolean }; output: void }
  'extension.loaded': { input: { extensionName: string }; output: void }
  'extension.error': { input: { extensionName: string; error: Error }; output: void }
}

// Hook 输入/输出泛型提取
export type HookInput<T extends HookTiming> = HookPayloadMap[T]['input']
export type HookOutput<T extends HookTiming> = HookPayloadMap[T]['output']

// Hook 处理器签名

// 有输出的 Hook (链式处理)
export type HookHandler<T extends HookTiming> =
  HookOutput<T> extends void
    ? (input: HookInput<T>) => void | Promise<void>
    : (input: HookInput<T>, output: HookOutput<T>) => void | Promise<void>

// ═══ Hook 注册信息 ═══
export interface HookRegistration<T extends HookTiming = HookTiming> {
  name: string
  timing: T
  priority: number
  enabled: boolean
  handler: HookHandler<T>
}
