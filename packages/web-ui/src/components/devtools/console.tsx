'use client'

import { useCallback, useEffect, useRef } from 'react'
import { ArrowDownToLine, Trash2, XIcon, TerminalIcon } from 'lucide-react'
import { cn } from 'lib/utils'
import {
  useLogStore,
  type LogEntry,
  type LogLevel,
  LOG_LEVEL_COLORS,
} from '@/app/store/log.store'
import { Button } from 'ui/button'

// ── Constants ─────────────────────────────────────────────────────

const LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']

// ── LogFilter ─────────────────────────────────────────────────────

function LogFilter() {
  const minLevel         = useLogStore((s) => s.minLevel)
  const moduleFilter     = useLogStore((s) => s.moduleFilter)
  const autoScroll       = useLogStore((s) => s.autoScroll)
  const setMinLevel      = useLogStore((s) => s.setMinLevel)
  const setModuleFilter  = useLogStore((s) => s.setModuleFilter)
  const setSearchQuery   = useLogStore((s) => s.setSearchQuery)
  const toggleAutoScroll = useLogStore((s) => s.toggleAutoScroll)
  const clear            = useLogStore((s) => s.clear)

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const handleSearch = useCallback(
    (value: string) => {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setSearchQuery(value), 300)
    },
    [setSearchQuery],
  )

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/60 bg-muted/30 shrink-0">
      <select
        value={minLevel}
        onChange={(e) => setMinLevel(e.target.value as LogLevel)}
        className="text-[10px] border border-border/60 rounded px-1 py-0.5 bg-background text-foreground"
      >
        {LEVELS.map((l) => (
          <option key={l} value={l}>{l}</option>
        ))}
      </select>

      <input
        value={moduleFilter}
        onChange={(e) => setModuleFilter(e.target.value)}
        placeholder="module..."
        className="w-16 text-[10px] border border-border/60 rounded px-1.5 py-0.5 bg-background text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
      />

      <input
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="search..."
        className="flex-1 text-[10px] border border-border/60 rounded px-1.5 py-0.5 bg-background text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
      />

      <Button
        variant="ghost"
        size="icon"
        className={cn('size-6', autoScroll && 'bg-accent text-accent-foreground')}
        title="Auto-scroll"
        onClick={toggleAutoScroll}
      >
        <ArrowDownToLine className="size-3" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="size-6 hover:text-destructive"
        title="Clear"
        onClick={clear}
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  )
}

// ── LogEntryRow ───────────────────────────────────────────────────

function LogEntryRow({ entry }: { entry: LogEntry }) {
  const expanded = useLogStore((s) => s.expandedIds.has(entry.id))
  const toggle   = useLogStore((s) => s.toggleExpanded)
  const isError  = entry.level === 'error' || entry.level === 'fatal'
  const ts       = entry.timestamp.split('T')[1]?.replace('Z', '') ?? entry.timestamp

  return (
    <div
      className={cn(
        'group border-b border-border/20 hover:bg-muted/40',
        isError && 'border-l-2 border-l-destructive bg-destructive/5',
      )}
    >
      <button
        onClick={() => toggle(entry.id)}
        className="w-full text-left px-3 py-0.5 flex items-baseline gap-2"
      >
        <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-[72px]">{ts}</span>
        <span className={cn('text-[10px] font-mono uppercase w-10 shrink-0', LOG_LEVEL_COLORS[entry.level])}>
          {entry.level}
        </span>
        <span className="text-[10px] font-mono text-blue-400 shrink-0 max-w-[80px] truncate">
          {entry.module}
        </span>
        <span className="text-[11px] text-foreground/80 flex-1 truncate">{entry.message}</span>
        {entry.data && (
          <span className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100">
            {expanded ? '▾' : '▸'}
          </span>
        )}
      </button>
      {expanded && entry.data && (
        <pre className="ml-[90px] mr-3 mb-1 text-[10px] font-mono text-muted-foreground bg-muted rounded p-1.5 overflow-x-auto max-h-40">
          {JSON.stringify(entry.data, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ── LogViewer ─────────────────────────────────────────────────────

function LogViewer() {
  const entries    = useLogStore((s) => s.filteredEntries)
  const autoScroll = useLogStore((s) => s.autoScroll)
  const bottomRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [entries.length, autoScroll])

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[11px] text-muted-foreground">
        No log entries
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ overflowAnchor: 'none' }}>
      {entries.map((entry) => (
        <LogEntryRow key={entry.id} entry={entry} />
      ))}
      <div ref={bottomRef} style={{ overflowAnchor: 'auto' }} />
    </div>
  )
}

// ── Console ───────────────────────────────────────────────────────

export interface ConsoleProps {
  onClose: () => void
}

export function Console({ onClose }: ConsoleProps) {
  const total    = useLogStore((s) => s.entries.length)
  const filtered = useLogStore((s) => s.filteredEntries.length)

  return (
    <div
      className={cn(
        // Positioning — matches ReactFlow Panel right/bottom offset
        'absolute bottom-3 right-3 z-50',
        // Size
        'w-96 h-72',
        // Dialog-style appearance
        'flex flex-col',
        'bg-background border border-border rounded-lg shadow-lg',
        // Entry animation
        'animate-in slide-in-from-bottom-3 fade-in-0 duration-200',
      )}
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 rounded-t-lg">
        <TerminalIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium flex-1">Console</span>
        <span className="text-[10px] text-muted-foreground font-mono mr-1">
          {filtered === total ? `${total} entries` : `${filtered} / ${total}`}
        </span>
        <Button variant="ghost" size="icon" className="size-6" onClick={onClose}>
          <XIcon className="size-3.5" />
        </Button>
      </div>

      <LogFilter />
      <LogViewer />
    </div>
  )
}
