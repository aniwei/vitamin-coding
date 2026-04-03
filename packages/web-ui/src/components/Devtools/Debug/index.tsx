import { Controls } from './Controls'
import { SnapshotViewer } from './SnapshotViewer'
import { ContextEditor } from './ContextEditor'
import { BreakpointList } from './BreakpointList'
import { useDebugStore } from '../../../stores/debug'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

function SnapshotHistory() {
  const history = useDebugStore((s) => s.snapshotHistory)
  const [open, setOpen] = useState(false)

  if (history.length === 0) return null

  return (
    <div className="border-b border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-gray-50 text-left"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-gray-400" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-400" />
        )}
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          History ({history.length})
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-1 max-h-32 overflow-y-auto">
          {history.map((snap, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-[10px] text-gray-500 py-0.5"
            >
              <span className="font-mono bg-gray-100 px-1 rounded">{snap.point}</span>
              <span>turn {snap.turn}</span>
              <span className="text-gray-400">
                {((snap.tokenUsage?.input ?? 0) + (snap.tokenUsage?.output ?? 0)).toLocaleString()} tokens
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Debug() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Controls />
      <div className="flex-1 overflow-y-auto">
        <SnapshotViewer />
        <ContextEditor />
        <BreakpointList />
        <SnapshotHistory />
      </div>
    </div>
  )
}
