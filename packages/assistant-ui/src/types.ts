export enum Theme {
  light = 'light',
  dark = 'dark',
  system = 'system',
}

export interface SystemFeatures {
  
}

export const defaultSystemFeatures: SystemFeatures = {
  
}

export interface Workspace {
  
}

export interface Session {
  id: string
  pinned: boolean
  title: string
  workspaceDir?: string
  createdAt: string
  updatedAt?: string
  messageCount: number
  tokenUsage?: Record<string, number>
  status?: 'active' | 'answered' | 'open'
  hasSessionModel?: boolean
}

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
  data: unknown
}