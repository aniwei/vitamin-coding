import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { useDebugStore } from '../../../stores/debug'

type Category = 'session' | 'prompt' | 'loop' | 'model' | 'tool'

interface BreakpointNodeProps {
  data: {
    label: string
    point: string
    isVirtual?: boolean
    category: Category
  }
}

const CATEGORY_STYLES: Record<Category, {
  bar: string       // left accent bar color
  bg: string        // background
  label: string     // label text color
  tag: string       // tag pill bg+text
  tagText: string
}> = {
  session: { bar: 'bg-gray-400',   bg: 'bg-gray-50',    label: 'text-gray-700',   tag: 'bg-gray-100',   tagText: 'text-gray-500' },
  prompt:  { bar: 'bg-violet-400', bg: 'bg-violet-50',  label: 'text-violet-800', tag: 'bg-violet-100', tagText: 'text-violet-600' },
  loop:    { bar: 'bg-blue-400',   bg: 'bg-blue-50',    label: 'text-blue-800',   tag: 'bg-blue-100',   tagText: 'text-blue-600' },
  model:   { bar: 'bg-emerald-400',bg: 'bg-emerald-50', label: 'text-emerald-800',tag: 'bg-emerald-100',tagText: 'text-emerald-600' },
  tool:    { bar: 'bg-orange-400', bg: 'bg-orange-50',  label: 'text-orange-800', tag: 'bg-orange-100', tagText: 'text-orange-600' },
}

export const BreakpointNode = memo(({ data }: BreakpointNodeProps) => {
  const { breakpoints, toggleBreakpoint, currentSnapshot, paused } = useDebugStore()

  const { label, point, isVirtual, category } = data
  const bp = breakpoints.find((b) => b.point === point)

  const isEnabled = bp?.enabled ?? false
  const isPausedHere = paused && currentSnapshot?.point === point

  const cat = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.session

  return (
    <div
      className={`relative flex items-stretch shadow-sm rounded-md border overflow-hidden min-w-[180px] ${
        isPausedHere
          ? 'border-amber-500 ring-2 ring-amber-200'
          : isEnabled
            ? 'border-primary-400'
            : 'border-gray-200'
      } ${isVirtual ? 'opacity-60' : ''}`}
    >
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-gray-400" />

      {/* Left category accent bar */}
      {!isVirtual && <div className={`w-1 shrink-0 ${cat.bar}`} />}

      {/* Content */}
      <div className={`flex-1 flex items-center justify-between px-3 py-2 ${isVirtual ? 'bg-gray-100' : cat.bg}`}>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className={`text-[11px] font-semibold leading-tight ${isVirtual ? 'text-gray-500 italic' : cat.label}`}>
            {label}
          </span>
          {!isVirtual && (
            <span className="text-[9px] font-mono text-gray-400 truncate">{point}</span>
          )}
        </div>

        {!isVirtual && (
          <label className="flex items-center cursor-pointer ml-3 shrink-0">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={isEnabled}
                onChange={() => toggleBreakpoint(point)}
                title={isEnabled ? 'Disable breakpoint' : 'Enable breakpoint'}
              />
              <div className={`block w-7 h-4 rounded-full transition-colors ${isEnabled ? cat.bar : 'bg-gray-300'}`} />
              <div className={`dot absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition-transform ${isEnabled ? 'translate-x-3' : ''}`} />
            </div>
          </label>
        )}
      </div>

      {isPausedHere && (
        <span className="absolute -left-2 -top-2 flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500" />
        </span>
      )}

      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-gray-400" />
    </div>
  )
})
