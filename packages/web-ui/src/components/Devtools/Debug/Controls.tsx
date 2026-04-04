import { Play, SkipForward, ArrowDownRight, Square } from 'lucide-react'
import { useDebugStore } from '../../../stores/debug'

const ACTIONS = [
  { key: 'resume', icon: Play, label: 'Resume', shortcut: 'F5', color: 'text-emerald-500' },
  { key: 'stepOver', icon: SkipForward, label: 'Step Over', shortcut: 'F10', color: 'text-blue-400' },
  { key: 'stepInto', icon: ArrowDownRight, label: 'Step Into', shortcut: 'F11', color: 'text-blue-400' },
  { key: 'disable', icon: Square, label: 'Stop', shortcut: '⇧F5', color: 'text-red-400' },
] as const

export function Controls() {
  const resume = useDebugStore((s) => s.resume)
  const stepOver = useDebugStore((s) => s.stepOver)
  const stepInto = useDebugStore((s) => s.stepInto)
  const disable = useDebugStore((s) => s.disable)
  const editDraft = useDebugStore((s) => s.editDraft)
  const currentSnapshot = useDebugStore((s) => s.currentSnapshot)

  const hasChanges =
    editDraft.systemPrompt !== currentSnapshot?.systemPrompt ||
    (editDraft.injectMessages?.length ?? 0) > 0 ||
    (editDraft.removeMessageIndices?.length ?? 0) > 0 ||
    JSON.stringify(editDraft.llmParams) !== JSON.stringify(currentSnapshot?.llmParams)

  const handlers: Record<string, () => void> = {
    resume: () => resume(),
    stepOver: () => stepOver(),
    stepInto: () => stepInto(),
    disable: () => disable(),
  }

  return (
    <div className="px-1 py-1 border-b border-gray-200 bg-amber-50/50">
      <div className="flex items-center gap-1">
        {ACTIONS.map(({ key, icon: Icon, label, shortcut, color }) => (
          <button
            key={key}
            onClick={handlers[key]}
            className={`p-1 rounded hover:bg-gray-200/50 transition-colors ${color}`}
            title={`${label} (${shortcut})`}
          >
            <Icon className="w-3 h-3" />
          </button>
        ))}
        {hasChanges && (
          <span className="ml-2 text-[10px] text-amber-600 font-medium">
            ⚡ with context changes
          </span>
        )}
      </div>
    </div>
  )
}
