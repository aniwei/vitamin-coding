import { create } from 'zustand'
import { api } from '../api/client'

export interface FileChange {
  id: string
  type: 'created' | 'modified' | 'deleted' | 'renamed'
  filePath: string
  oldPath?: string
  timestamp: string
  linesAdded: number
  linesRemoved: number
  description?: string
  icon: string
  color: string
  summary: string
}

export interface FileChangesSummary {
  total: number
  created: number
  modified: number
  deleted: number
  renamed: number
  totalLinesAdded: number
  totalLinesRemoved: number
  netLines: number
}

interface FileChangesState {
  changes: FileChange[]
  summary: FileChangesSummary | null
  isLoading: boolean
  error: string | null

  // Actions
  loadFileChanges: (sessionId: string) => Promise<void>
  clearChanges: () => void
}

function normalizeFileChange(raw: any): FileChange {
  return {
    id: raw.id,
    type: raw.type,
    filePath: raw.filePath,
    oldPath: raw.oldPath,
    timestamp: raw.timestamp,
    linesAdded: raw.linesAdded ?? 0,
    linesRemoved: raw.linesRemoved ?? 0,
    description: raw.description,
    icon: raw.icon,
    color: raw.color,
    summary: raw.summary,
  }
}

function normalizeSummary(raw: any): FileChangesSummary | null {
  if (!raw || typeof raw !== 'object') {return null}
  return {
    total: raw.total ?? 0,
    created: raw.created ?? 0,
    modified: raw.modified ?? 0,
    deleted: raw.deleted ?? 0,
    renamed: raw.renamed ?? 0,
    totalLinesAdded: raw.totalLinesAdded ?? 0,
    totalLinesRemoved: raw.totalLinesRemoved ?? 0,
    netLines: raw.netLines ?? 0,
  }
}

export const useFileChangesStore = create<FileChangesState>((set) => ({
  changes: [],
  summary: null,
  isLoading: false,
  error: null,

  loadFileChanges: async (sessionId: string) => {
    set({ isLoading: true, error: null })

    try {
      const response = await api.get<any>(`/sessions/${sessionId}/file-changes`)
      const data = response?.data ?? response
      const rawChanges = Array.isArray(data?.changes) ? data.changes : []

      set({
        changes: rawChanges.map(normalizeFileChange),
        summary: normalizeSummary(data?.summary),
        isLoading: false,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load file changes',
        isLoading: false,
      })
    }
  },

  clearChanges: () => {
    set({
      changes: [],
      summary: null,
      error: null,
    })
  },
}))
