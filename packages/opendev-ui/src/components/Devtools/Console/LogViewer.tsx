import { useEffect, useRef } from 'react'
import { useLogStore } from '../../../stores/logs'
import { LOG_LEVEL_COLORS } from '../../../types/logs'

function LogEntryRow({ entry }: { entry: import('../../../types/logs').LogEntry }) {
  const expanded = useLogStore((s) => s.expandedIds.has(entry.id))
  const toggle = useLogStore((s) => s.toggleExpanded)

  const isError = entry.level === 'error' || entry.level === 'fatal'
  const ts = entry.timestamp.split('T')[1]?.replace('Z', '') ?? entry.timestamp

  return (
    <div
      className={`group border-b border-gray-50 hover:bg-gray-50/60 ${
        isError ? 'border-l-2 border-l-red-400 bg-red-50/30' : ''
      }`}
    >
      <button
        onClick={() => toggle(entry.id)}
        className='w-full text-left px-2 py-0.5 flex items-baseline gap-2'
      >
        <span className='text-[10px] font-mono text-gray-400 shrink-0 w-[72px]'>{ts}</span>
        <span
          className={`text-[10px] font-mono uppercase w-10 shrink-0 ${LOG_LEVEL_COLORS[entry.level]}`}
        >
          {entry.level}
        </span>
        <span className='text-[10px] font-mono text-blue-500 shrink-0 max-w-[80px] truncate'>
          {entry.module}
        </span>
        <span className='text-[11px] text-gray-700 flex-1 truncate'>{entry.message}</span>
        {entry.data && (
          <span className='text-[9px] text-gray-400 opacity-0 group-hover:opacity-100'>
            {expanded ? '▾' : '▸'}
          </span>
        )}
      </button>
      {expanded && entry.data && (
        <pre className='ml-[86px] mr-2 mb-1 text-[10px] font-mono text-gray-600 bg-gray-50 rounded p-1.5 overflow-x-auto max-h-40'>
          {JSON.stringify(entry.data, null, 2)}
        </pre>
      )}
    </div>
  )
}

export function LogViewer() {
  const entries = useLogStore((s) => s.filteredEntries)
  const autoScroll = useLogStore((s) => s.autoScroll)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [entries.length, autoScroll])

  if (entries.length === 0) {
    return (
      <div className='flex-1 flex items-center justify-center text-[11px] text-gray-400'>
        No log entries
      </div>
    )
  }

  return (
    <div className='flex-1 overflow-y-auto' style={{ overflowAnchor: 'none' }}>
      {entries.map((entry) => (
        <LogEntryRow key={entry.id} entry={entry} />
      ))}
      <div ref={bottomRef} style={{ overflowAnchor: 'auto' }} />
    </div>
  )
}
