// @vitamin/hooks 核心类型
import type { AgentMessage, AgentTool, ToolResult } from '@vitamin/agent'

// ═══ 31 种 Hook 时机 ═══

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
  // 编排器事件 (orchestrator)
  | 'task.created'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.cancelled'
  | 'task.recovered'
  | 'review.requested'
  | 'review.passed'
  | 'review.failed'
  // Plan 事件
  | 'plan.created'
  | 'plan.updated'
  | 'plan.task_updated'
  // System-prompt 变换
  | 'system-prompt.transform'

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
  args: Record<string, unknown>
  agentName: string
  sessionId: string
}

export interface ToolExecuteBeforeOutput {
  args: Record<string, unknown>
  cancelled: boolean
  cancelReason?: string
}

export interface ToolExecuteAfterInput {
  toolName: string
  toolCallId: string
  args: Record<string, unknown>
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
  sessionId?: string
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

export interface SystemPromptTransformInput {
  systemPrompt: string
  sessionId: string
  tools: AgentTool[]
}

export interface SystemPromptTransformOutput {
  systemPrompt: string
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
  // 编排器事件 (orchestrator)
  'task.created': { input: { task: Record<string, unknown> }; output: void }
  'task.started': { input: { task: Record<string, unknown>; agent: string }; output: void }
  'task.completed': {
    input: {
      task: Record<string, unknown>
      result: Record<string, unknown>
      subagentResult?: Record<string, unknown>
    }
    output: void
  }
  'task.failed': {
    input: { task: Record<string, unknown>; error: Record<string, unknown> }
    output: void
  }
  'task.cancelled': { input: { taskId: string }; output: void }
  'task.recovered': {
    input: { task: Record<string, unknown>; fromCheckpoint: string }
    output: void
  }
  'review.requested': { input: { taskId: string; reviewType: string }; output: void }
  'review.passed': { input: { taskId: string; reviewType: string }; output: void }
  'review.failed': { input: { taskId: string; reviewType: string; issues: string[] }; output: void }
  // Plan 事件
  'plan.created': { input: { plan: Record<string, unknown> }; output: void }
  'plan.updated': {
    input: { planId: string; action: string; plan: Record<string, unknown> }
    output: void
  }
  'plan.task_updated': {
    input: { planId: string; taskId: string; patch: Record<string, unknown> }
    output: void
  }
  'system-prompt.transform': {
    input: SystemPromptTransformInput
    output: SystemPromptTransformOutput
  }
}

export type HookInput<T extends HookTiming> = HookPayloadMap[T]['input']
export type HookOutput<T extends HookTiming> = HookPayloadMap[T]['output']

// output 是否为 void 决定 timing 类别，新增 timing 只需更新 HookPayloadMap
export type ObserverTiming = {
  [K in HookTiming]: HookPayloadMap[K]['output'] extends void ? K : never
}[HookTiming]

export type InterceptorTiming = {
  [K in HookTiming]: HookPayloadMap[K]['output'] extends void ? never : K
}[HookTiming]

// output 为 void 时无 output 参数，强制调用侧意图明确
export type HookHandle<T extends HookTiming> = T extends ObserverTiming
  ? (input: HookInput<T>) => void | Promise<void>
  : (input: HookInput<T>, output: HookOutput<T>) => void | Promise<void>
