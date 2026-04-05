import { useCallback, useRef } from 'react'
import { Trash2, ArrowDownToLine } from 'lucide-react'
import { useLogStore } from '../../../stores/logs'
import type { LogLevel } from '../../../types/logs'

const LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']

export function LogFilter() {
  const minLevel = useLogStore((s) => s.minLevel)
  const moduleFilter = useLogStore((s) => s.moduleFilter)
  const searchQuery = useLogStore((s) => s.searchQuery)
  const autoScroll = useLogStore((s) => s.autoScroll)
  const setMinLevel = useLogStore((s) => s.setMinLevel)
  const setModuleFilter = useLogStore((s) => s.setModuleFilter)
  const setSearchQuery = useLogStore((s) => s.setSearchQuery)
  const toggleAutoScroll = useLogStore((s) => s.toggleAutoScroll)
  const clear = useLogStore((s) => s.clear)

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const handleSearchChange = useCallback(
    (value: string) => {
      clearTimeout(searchTimerRef.current)
      searchTimerRef.current = setTimeout(() => setSearchQuery(value), 300)
    },
    [setSearchQuery],
  )

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 border-b border-gray-200 bg-gray-50/80">
      <select
        value={minLevel}
        onChange={(e) => setMinLevel(e.target.value as LogLevel)}
        className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white"
      >
        {LEVELS.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>

      <input
        value={moduleFilter}
        onChange={(e) => setModuleFilter(e.target.value)}
        placeholder="module..."
        className="w-16 text-[10px] border border-gray-200 rounded px-1.5 py-0.5"
      />

      <input
        defaultValue={searchQuery}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder="search..."
        className="flex-1 text-[10px] border border-gray-200 rounded px-1.5 py-0.5"
      />

      <button
        onClick={toggleAutoScroll}
        className={`p-0.5 rounded ${
          autoScroll ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'
        }`}
        title="Auto-scroll"
      >
        <ArrowDownToLine className="w-3 h-3" />
      </button>

      <button
        onClick={clear}
        className="p-0.5 rounded text-gray-400 hover:bg-gray-100 hover:text-red-500"
        title="Clear logs"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}
