import { Workflow } from 'lucide-react'
import { useDebugStore } from '../../stores/debug'

export function DebugStatusBadge() {
  const enabled = useDebugStore((s) => s.enabled)
  const paused = useDebugStore((s) => s.paused)
  const currentSnapshot = useDebugStore((s) => s.currentSnapshot)
  const togglePanel = useDebugStore((s) => s.togglePanel)

  if (paused) {
    return (
      <button
        onClick={togglePanel}
        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium animate-pulse"
      >
        <Workflow className="w-3 h-3" />
        Paused {currentSnapshot?.point ? `at ${currentSnapshot.point}` : ''}
      </button>
    )
  }

  if (enabled) {
    return (
      <button
        onClick={togglePanel}
        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-medium"
      >
        <Workflow className="w-3 h-3" />
        Debug
      </button>
    )
  }

  return (
    <button
      onClick={togglePanel}
      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium"
    >
      <Workflow className="w-3 h-3" />
      Debug Off
    </button>
  )
}
