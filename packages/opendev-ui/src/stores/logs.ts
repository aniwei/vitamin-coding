import { create } from 'zustand'
import type { LogEntry, LogLevel } from '../types/logs'
import { LOG_LEVEL_SEVERITY } from '../types/logs'

const MAX_ENTRIES = 5000

interface LogState {
  entries: LogEntry[]
  filteredEntries: LogEntry[]

  // 过滤器
  minLevel: LogLevel
  moduleFilter: string
  searchQuery: string

  // UI
  autoScroll: boolean
  expandedIds: Set<number>

  // 操作方法
  appendEntry: (entry: LogEntry) => void
  appendBatch: (entries: LogEntry[]) => void
  clear: () => void

  setMinLevel: (level: LogLevel) => void
  setModuleFilter: (module: string) => void
  setSearchQuery: (query: string) => void
  toggleAutoScroll: () => void
  toggleExpanded: (id: number) => void
}

function applyFilter(
  entries: LogEntry[],
  minLevel: LogLevel,
  moduleFilter: string,
  searchQuery: string,
): LogEntry[] {
  const minSeverity = LOG_LEVEL_SEVERITY[minLevel]
  const lowerQuery = searchQuery.toLowerCase()
  return entries.filter((e) => {
    if (LOG_LEVEL_SEVERITY[e.level] < minSeverity) {return false}
    if (moduleFilter && !e.module.includes(moduleFilter)) {return false}
    if (lowerQuery && !e.message.toLowerCase().includes(lowerQuery)) {return false}
    return true
  })
}

export const useLogStore = create<LogState>((set) => ({
  entries: [],
  filteredEntries: [],
  minLevel: 'info',
  moduleFilter: '',
  searchQuery: '',
  autoScroll: true,
  expandedIds: new Set(),

  appendEntry: (entry) => {
    set((s) => {
      const entries =
        s.entries.length >= MAX_ENTRIES
          ? [...s.entries.slice(s.entries.length - MAX_ENTRIES + 1), entry]
          : [...s.entries, entry]
      return {
        entries,
        filteredEntries: applyFilter(entries, s.minLevel, s.moduleFilter, s.searchQuery),
      }
    })
  },

  appendBatch: (batch) => {
    set((s) => {
      let entries = [...s.entries, ...batch]
      if (entries.length > MAX_ENTRIES) {
        entries = entries.slice(entries.length - MAX_ENTRIES)
      }
      return {
        entries,
        filteredEntries: applyFilter(entries, s.minLevel, s.moduleFilter, s.searchQuery),
      }
    })
  },

  clear: () => set({ entries: [], filteredEntries: [] }),

  setMinLevel: (level) => {
    set((s) => ({
      minLevel: level,
      filteredEntries: applyFilter(s.entries, level, s.moduleFilter, s.searchQuery),
    }))
  },

  setModuleFilter: (module) => {
    set((s) => ({
      moduleFilter: module,
      filteredEntries: applyFilter(s.entries, s.minLevel, module, s.searchQuery),
    }))
  },

  setSearchQuery: (query) => {
    set((s) => ({
      searchQuery: query,
      filteredEntries: applyFilter(s.entries, s.minLevel, s.moduleFilter, query),
    }))
  },

  toggleAutoScroll: () => set((s) => ({ autoScroll: !s.autoScroll })),

  toggleExpanded: (id) => {
    set((s) => {
      const next = new Set(s.expandedIds)
      if (next.has(id)) {next.delete(id)}
      else {next.add(id)}
      return { expandedIds: next }
    })
  },
}))
