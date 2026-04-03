import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { useDebugStore } from '../../../stores/debug'
import { BREAKPOINT_CATEGORIES } from '../../../types/debug'

function CategoryGroup({
  name,
  points,
}: {
  name: string
  points: readonly string[]
}) {
  const [expanded, setExpanded] = useState(true)
  const breakpoints = useDebugStore((s) => s.breakpoints)
  const toggleBreakpoint = useDebugStore((s) => s.toggleBreakpoint)
  const currentPoint = useDebugStore((s) => s.currentSnapshot?.point)

  const bpMap = new Map(breakpoints.map((bp) => [bp.point, bp.enabled]))
  const enabledCount = points.filter((p) => bpMap.get(p) === true).length

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-3 py-1 hover:bg-gray-100 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
        )}
        <span className="text-[11px] font-medium text-gray-600 flex-1">{name}</span>
        <span className="text-[10px] text-gray-400 tabular-nums">
          {enabledCount}/{points.length}
        </span>
      </button>

      {expanded && (
        <div className="ml-4">
          {points.map((point) => {
            const enabled = bpMap.get(point) ?? false
            const isCurrent = point === currentPoint

            return (
              <label
                key={point}
                className={`flex items-center gap-2 px-3 py-0.5 cursor-pointer hover:bg-gray-50 ${
                  isCurrent ? 'bg-amber-50' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleBreakpoint(point)}
                  className="w-3 h-3 rounded border-gray-300 text-blue-500 focus:ring-blue-500/30"
                />
                <span
                  className={`text-[11px] font-mono ${
                    isCurrent ? 'text-amber-700 font-semibold' : 'text-gray-700'
                  }`}
                >
                  {point}
                </span>
                {isCurrent && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                )}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function BreakpointList() {
  const enableAll = useDebugStore((s) => s.enableAll)
  const disableAll = useDebugStore((s) => s.disableAll)
  const loadingBreakpoints = useDebugStore((s) => s.loadingBreakpoints)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          Breakpoints
        </span>
        <div className="flex gap-1">
          <button
            onClick={enableAll}
            disabled={loadingBreakpoints}
            className="text-[10px] px-1.5 py-0.5 rounded hover:bg-gray-100 text-blue-500 transition-colors"
          >
            All
          </button>
          <button
            onClick={disableAll}
            disabled={loadingBreakpoints}
            className="text-[10px] px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-400 transition-colors"
          >
            None
          </button>
        </div>
      </div>

      {Object.entries(BREAKPOINT_CATEGORIES).map(([name, points]) => (
        <CategoryGroup key={name} name={name} points={points} />
      ))}
    </div>
  )
}
