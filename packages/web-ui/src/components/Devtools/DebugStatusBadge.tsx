import { Bug } from 'lucide-react'
import { useDevtoolsStore } from '../../stores/devtools'

export function DebugStatusBadge() {
  const enabled = useDevtoolsStore((s) => s.enabled)
  const paused = useDevtoolsStore((s) => s.paused)
  const currentSnapshot = useDevtoolsStore((s) => s.currentSnapshot)
  const togglePanel = useDevtoolsStore((s) => s.togglePanel)

  if (paused) {
    return (
      <button
        onClick={togglePanel}
        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium animate-pulse"
      >
        <Bug className="w-3 h-3" />
        Paused {currentSnapshot?.point ? `at ${currentSnapshot.point}` : ''}
      </button>
    )
  }

  if (enabled) {
    return (
      <button
        onClick={togglePanel}
        className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-medium"
      >
        <Bug className="w-3 h-3" />
        Devtools
      </button>
    )
  }

  return (
    <button
      onClick={togglePanel}
      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium"
    >
      <Bug className="w-3 h-3" />
      Debug Off
    </button>
  )
}
