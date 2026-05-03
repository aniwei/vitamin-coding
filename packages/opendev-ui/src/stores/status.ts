import { isRecord, readNumber, readObject, readString } from '@x-mars/shared/browser/data'
import { create } from 'zustand'
import { ws } from '../api/websocket'

export interface StatusBarData {
  model: string | null
  provider: string | null
  inputTokens: number
  outputTokens: number
  maxTokens: number
  contextUsagePct: number
  sessionCostUsd: number
  gitBranch: string | null
  autonomyLevel: 'Manual' | 'Semi-Auto' | 'Auto'
  thinkingLevel: 'Off' | 'Low' | 'Medium' | 'High'
  mcpConnected: number
  mcpTotal: number
  fileChanges: { files: number; additions: number; deletions: number } | null
}

interface StatusStore {
  data: StatusBarData
  update: (partial: Partial<StatusBarData>) => void
}

const DEFAULT_STATUS: StatusBarData = {
  model: null,
  provider: null,
  inputTokens: 0,
  outputTokens: 0,
  maxTokens: 200000,
  contextUsagePct: 0,
  sessionCostUsd: 0,
  gitBranch: null,
  autonomyLevel: 'Semi-Auto',
  thinkingLevel: 'Medium',
  mcpConnected: 0,
  mcpTotal: 0,
  fileChanges: null,
}

export const useStatusStore = create<StatusStore>((set) => ({
  data: DEFAULT_STATUS,
  update: (partial) => set((state) => ({ data: { ...state.data, ...partial } })),
}))

// 订阅 WebSocket 状态事件
ws.on('Session.statusUpdate', (message) => {
  if (!isRecord(message.data)) {
    return
  }
  const d = message.data

  const updates: Partial<StatusBarData> = {}
  if (typeof d.model === 'string') {
    updates.model = d.model
  }
  updates.provider = readString(d, 'provider', 'modelProvider') ?? updates.provider
  updates.inputTokens = readNumber(d, 'inputTokens') ?? updates.inputTokens
  updates.outputTokens = readNumber(d, 'outputTokens') ?? updates.outputTokens
  updates.maxTokens = readNumber(d, 'maxTokens') ?? updates.maxTokens
  updates.contextUsagePct = readNumber(d, 'contextUsagePct') ?? updates.contextUsagePct
  updates.sessionCostUsd = readNumber(d, 'sessionCostUsd') ?? updates.sessionCostUsd
  updates.gitBranch = readString(d, 'gitBranch') ?? updates.gitBranch
  updates.autonomyLevel =
    (readString(d, 'autonomyLevel') as StatusBarData['autonomyLevel'] | undefined) ??
    updates.autonomyLevel
  updates.thinkingLevel =
    (readString(d, 'thinkingLevel') as StatusBarData['thinkingLevel'] | undefined) ??
    updates.thinkingLevel
  updates.mcpConnected = readNumber(d, 'mcpConnected') ?? updates.mcpConnected
  updates.mcpTotal = readNumber(d, 'mcpTotal') ?? updates.mcpTotal
  updates.fileChanges =
    readObject<StatusBarData['fileChanges']>(d, 'fileChanges') ?? updates.fileChanges

  useStatusStore.getState().update(updates)
})
