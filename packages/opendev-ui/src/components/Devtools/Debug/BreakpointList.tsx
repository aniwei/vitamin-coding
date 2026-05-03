import { useMemo, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { useDevtoolsStore } from '../../../stores/devtools'
import {
  BREAKPOINT_CATEGORY_LABELS,
  type Breakpoint,
  type BreakpointCategory,
} from '../../../types/devtools'

const CATEGORY_ORDER: BreakpointCategory[] = [
  'agent_work_loop',
  'work_loop_injection',
  'tool_executor',
  'session_prompt_lifecycle',
  'custom',
]

function normalizeCategory(category?: Breakpoint['category']): BreakpointCategory {
  return category ?? 'custom'
}

function groupBreakpoints(breakpoints: Breakpoint[]): Array<{
  category: BreakpointCategory
  name: string
  items: Breakpoint[]
}> {
  const groups = new Map<BreakpointCategory, Breakpoint[]>()

  for (const breakpoint of breakpoints) {
    const category = normalizeCategory(breakpoint.category)
    const current = groups.get(category)
    if (current) {
      current.push(breakpoint)
      continue
    }

    groups.set(category, [breakpoint])
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => CATEGORY_ORDER.indexOf(left) - CATEGORY_ORDER.indexOf(right))
    .map(([category, items]) => ({
      category,
      name: BREAKPOINT_CATEGORY_LABELS[category],
      items,
    }))
}

function CategoryGroup({ name, items }: { name: string; items: Breakpoint[] }) {
  const [expanded, setExpanded] = useState(true)
  const toggleBreakpoint = useDevtoolsStore((s) => s.toggleBreakpoint)
  const currentPoint = useDevtoolsStore((s) => s.currentSnapshot?.point)

  const enabledCount = items.filter((item) => item.enabled).length

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className='w-full flex items-center gap-1.5 px-3 py-1 hover:bg-gray-100 transition-colors text-left'
      >
        {expanded ? (
          <ChevronDown className='w-3 h-3 text-gray-400 flex-shrink-0' />
        ) : (
          <ChevronRight className='w-3 h-3 text-gray-400 flex-shrink-0' />
        )}
        <span className='text-[11px] font-medium text-gray-600 flex-1'>{name}</span>
        <span className='text-[10px] text-gray-400 tabular-nums'>
          {enabledCount}/{items.length}
        </span>
      </button>

      {expanded && (
        <div className='ml-4'>
          {items.map((breakpoint) => {
            const { point, enabled } = breakpoint
            const displayName = breakpoint.name ?? point
            const isCurrent = point === currentPoint

            return (
              <label
                key={point}
                className={`flex items-center gap-2 px-3 py-0.5 cursor-pointer hover:bg-gray-50 ${
                  isCurrent ? 'bg-amber-50' : ''
                }`}
              >
                <input
                  type='checkbox'
                  checked={enabled}
                  onChange={() => toggleBreakpoint(point)}
                  className='w-3 h-3 rounded border-gray-300 text-blue-500 focus:ring-blue-500/30'
                />
                <div className='min-w-0 flex-1'>
                  <div
                    className={`text-[11px] ${
                      isCurrent ? 'text-amber-700 font-semibold' : 'text-gray-700'
                    }`}
                  >
                    {displayName}
                  </div>
                  {displayName !== point && (
                    <div className='text-[10px] font-mono text-gray-400 truncate'>{point}</div>
                  )}
                </div>
                {isCurrent && (
                  <span className='w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse' />
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
  const enableAll = useDevtoolsStore((s) => s.enableAll)
  const disableAll = useDevtoolsStore((s) => s.disableAll)
  const breakpoints = useDevtoolsStore((s) => s.breakpoints)
  const loadingBreakpoints = useDevtoolsStore((s) => s.loadingBreakpoints)

  const groupedBreakpoints = useMemo(() => groupBreakpoints(breakpoints), [breakpoints])

  return (
    <div className='flex-1 overflow-y-auto'>
      <div className='flex items-center justify-between px-3 py-1.5 border-b border-gray-100'>
        <span className='text-[11px] font-semibold text-gray-500 uppercase tracking-wider'>
          Breakpoints
        </span>
        <div className='flex gap-1'>
          <button
            onClick={enableAll}
            disabled={loadingBreakpoints}
            className='text-[10px] px-1.5 py-0.5 rounded hover:bg-gray-100 text-blue-500 transition-colors'
          >
            All
          </button>
          <button
            onClick={disableAll}
            disabled={loadingBreakpoints}
            className='text-[10px] px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-400 transition-colors'
          >
            None
          </button>
        </div>
      </div>

      {groupedBreakpoints.map((group) => (
        <CategoryGroup key={group.category} name={group.name} items={group.items} />
      ))}
    </div>
  )
}
