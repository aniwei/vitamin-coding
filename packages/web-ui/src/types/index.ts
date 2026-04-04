// Tool call information
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

// Message types
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

// Session types
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

// Configuration types
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

// Provider types
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

// WebSocket event types
export interface WebSocketMessage {
  type:
    | 'user_message'
    | 'message_start'
    | 'message_chunk'
    | 'message_complete'
    | 'tool_call'
    | 'tool_result'
    | 'approval_required'
    | 'approval_resolved'
    | 'error'
    | 'pong'
    | 'mcp_status_update'
    | 'mcp_servers_update'
    | 'connected'
    | 'disconnected'
    | 'thinking_block'
    | 'status_update'
    | 'ask_user_required'
    | 'ask_user_resolved'
    | 'session_activity'
    | 'plan_approval_required'
    | 'plan_approval_resolved'
    | 'plan_content'
    | 'subagent_start'
    | 'subagent_complete'
    | 'parallel_agents_start'
    | 'parallel_agents_done'
    | 'task_completed'
    | 'progress'
    | 'nested_tool_call'
    | 'nested_tool_result'
    | 'Debugger.paused'
    | 'Debugger.resumed'
    | 'Debugger.breakpointsChanged'
    | 'Log.entryAdded'
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

// Status bar info
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

// Ask-user question types
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

// Plan approval types
export interface PlanApprovalRequest {
  requestId: string
  planContent: string
}

// Per-session state for concurrent session support
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
