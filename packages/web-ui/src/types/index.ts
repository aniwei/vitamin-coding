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
    | 'Chat.userMessage'
    | 'Chat.messageStart'
    | 'Chat.messageChunk'
    | 'Chat.messageComplete'
    | 'Chat.toolCall'
    | 'Chat.toolResult'
    | 'Chat.approvalRequired'
    | 'Chat.approvalResolved'
    | 'Runtime.error'
    | 'Runtime.pong'
    | 'MCP.statusUpdate'
    | 'MCP.serversUpdate'
    | 'Runtime.connected'
    | 'Runtime.disconnected'
    | 'Chat.thinkingBlock'
    | 'Session.statusUpdate'
    | 'Chat.askUserRequired'
    | 'Chat.askUserResolved'
    | 'Session.activity'
    | 'Chat.planApprovalRequired'
    | 'Chat.planApprovalResolved'
    | 'Chat.planContent'
    | 'Chat.subagentStart'
    | 'Chat.subagentComplete'
    | 'Chat.parallelAgentsStart'
    | 'Chat.parallelAgentsDone'
    | 'Chat.taskCompleted'
    | 'Chat.progress'
    | 'Chat.nestedToolCall'
    | 'Chat.nestedToolResult'
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
