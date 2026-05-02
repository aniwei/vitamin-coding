// 工具调用信息
export interface ToolCallInfo {
  id: string
  name: string
  parameters: Record<string, unknown>
  result?: string | null
  error?: string | null
  resultSummary?: string | null
  approved?: boolean | null
  nestedToolCalls?: ToolCallInfo[] | null
}

// 消息类型
export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result' | 'thinking'
  content: string
  timestamp?: string
  toolCallId?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: unknown
  toolArgsDisplay?: string | null
  toolSummary?: string | string[] | null
  toolSuccess?: boolean
  toolError?: string | null
  toolCalls?: ToolCallInfo[]
  metadata?: Record<string, unknown>
  depth?: number
  parentToolCallId?: string
  thinkingTrace?: string | null
  reasoningContent?: string | null
}

// 会话类型
export interface Session {
  id: string
  workingDirectory?: string
  createdAt: string
  updatedAt?: string
  messageCount: number
  tokenUsage?: Record<string, number>
  title?: string
  status?: 'active' | 'answered' | 'open'
  hasSessionModel?: boolean
}

// 配置类型
export interface Config {
  modelProvider?: string
  model?: string
  apiKey?: string | null
  temperature?: number
  enableBash?: boolean
  workingDirectory?: string
  mode?: 'normal' | 'plan'
  autonomyLevel?: 'Manual' | 'Semi-Auto' | 'Auto'
  thinkingLevel?: 'Off' | 'Low' | 'Medium' | 'High'
  gitBranch?: string | null
  modelThinkingProvider?: string | null
  modelThinking?: string | null
  modelCompactProvider?: string | null
  modelCompact?: string | null
  modelVlmProvider?: string | null
  modelVlm?: string | null
}

// Provider 类型
export interface Model {
  id: string
  name: string
  description: string
}

export interface Provider {
  id: string
  name: string
  description: string
  models: Model[]
}

import type { WebSocketMessage as ProtocolWebSocketMessage } from '@vitamin/protocol'

// UI stores still normalize and read event payloads defensively because older
// service events may contain compatibility fields beyond the strict protocol.
export interface WebSocketMessage {
  type: ProtocolWebSocketMessage['type'] | 'Runtime.disconnected'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  requiresApproval?: boolean
}

export interface ApprovalRequest {
  id: string
  toolName: string
  arguments: Record<string, unknown>
  description: string
  preview?: string
}

// 状态栏信息
export interface StatusInfo {
  mode: 'normal' | 'plan'
  autonomyLevel: 'Manual' | 'Semi-Auto' | 'Auto'
  thinkingLevel?: 'Off' | 'Low' | 'Medium' | 'High'
  model?: string
  modelProvider?: string
  workingDirectory?: string
  gitBranch?: string | null
  sessionCost?: number
  contextUsagePct?: number
}

// Ask-user 问题类型
export interface AskUserOption {
  label: string
  description?: string
}

export interface AskUserQuestion {
  question: string
  header: string
  options: AskUserOption[]
  multiSelect: boolean
}

export interface AskUserRequest {
  requestId: string
  questions: AskUserQuestion[]
}

// 计划审批类型
export interface PlanApprovalRequest {
  requestId: string
  planContent: string
}

// 每个会话的独立状态（支持并发会话）
export interface PerSessionState {
  messages: Message[]
  isLoading: boolean
  error: string | null
  pendingApproval: ApprovalRequest | null
  pendingAskUser: AskUserRequest | null
  pendingPlanApproval: PlanApprovalRequest | null
  progressMessage: string | null
  queuedMessages: string[]
}
