import { create } from 'zustand'

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface LogEntry {
  id: number
  timestamp: string
  level: LogLevel
  module: string
  message: string
  data?: Record<string, unknown>
}

export const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
}

export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  trace:  'text-muted-foreground',
  debug:  'text-zinc-400',
  info:   'text-blue-400',
  warn:   'text-yellow-400',
  error:  'text-red-400',
  fatal:  'text-red-500 font-bold',
}

const MAX_ENTRIES = 5000
let _idSeq = 0

function applyFilter(
  entries: LogEntry[],
  minLevel: LogLevel,
  moduleFilter: string,
  searchQuery: string,
): LogEntry[] {
  const minSev = LOG_LEVEL_SEVERITY[minLevel]
  const lq = searchQuery.toLowerCase()
  return entries.filter((e) => {
    if (LOG_LEVEL_SEVERITY[e.level] < minSev) return false
    if (moduleFilter && !e.module.includes(moduleFilter)) return false
    if (lq && !e.message.toLowerCase().includes(lq)) return false
    return true
  })
}

interface LogState {
  entries: LogEntry[]
  filteredEntries: LogEntry[]
  minLevel: LogLevel
  moduleFilter: string
  searchQuery: string
  autoScroll: boolean
  expandedIds: Set<number>
}

interface LogDispatch {
  append: (entry: Omit<LogEntry, 'id'>) => void
  appendBatch: (entries: Omit<LogEntry, 'id'>[]) => void
  clear: () => void
  setMinLevel: (level: LogLevel) => void
  setModuleFilter: (module: string) => void
  setSearchQuery: (query: string) => void
  toggleAutoScroll: () => void
  toggleExpanded: (id: number) => void
}

export const useLogStore = create<LogState & LogDispatch>((set) => ({
  entries: [],
  filteredEntries: [],
  minLevel: 'info',
  moduleFilter: '',
  searchQuery: '',
  autoScroll: true,
  expandedIds: new Set(),

  append: (raw) => {
    const entry: LogEntry = { ...raw, id: ++_idSeq }
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

  appendBatch: (raws) => {
    const batch = raws.map((r) => ({ ...r, id: ++_idSeq }))
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

  setMinLevel: (level) =>
    set((s) => ({
      minLevel: level,
      filteredEntries: applyFilter(s.entries, level, s.moduleFilter, s.searchQuery),
    })),

  setModuleFilter: (module) =>
    set((s) => ({
      moduleFilter: module,
      filteredEntries: applyFilter(s.entries, s.minLevel, module, s.searchQuery),
    })),

  setSearchQuery: (query) =>
    set((s) => ({
      searchQuery: query,
      filteredEntries: applyFilter(s.entries, s.minLevel, s.moduleFilter, query),
    })),

  toggleAutoScroll: () => set((s) => ({ autoScroll: !s.autoScroll })),

  toggleExpanded: (id) =>
    set((s) => {
      const next = new Set(s.expandedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { expandedIds: next }
    }),
}))
