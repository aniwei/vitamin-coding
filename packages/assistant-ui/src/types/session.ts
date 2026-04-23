
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
