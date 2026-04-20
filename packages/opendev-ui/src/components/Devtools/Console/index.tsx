import { LogFilter } from './LogFilter'
import { LogViewer } from './LogViewer'
import { useLogStore } from '../../../stores/logs'

export function Console() {
  const total = useLogStore((s) => s.entries.length)
  const filtered = useLogStore((s) => s.filteredEntries.length)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <LogFilter />
      <LogViewer />
      <div className="flex items-center gap-2 px-2 py-0.5 border-t border-gray-200 bg-gray-50/80">
        <span className="text-[10px] text-gray-400">
          {filtered === total ? `${total} entries` : `${filtered} / ${total} entries`}
        </span>
      </div>
    </div>
  )
}
