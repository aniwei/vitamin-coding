import { useState } from 'react'
import { ChevronDown, ChevronRight, RotateCcw, Plus } from 'lucide-react'
import { useDevtoolsStore } from '../../../stores/devtools'

function Section({
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string
  defaultOpen?: boolean
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className='border-b border-gray-100'>
      <button
        onClick={() => setOpen(!open)}
        className='w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-gray-50 text-left'
      >
        {open ? (
          <ChevronDown className='w-3 h-3 text-gray-400' />
        ) : (
          <ChevronRight className='w-3 h-3 text-gray-400' />
        )}
        <span className='text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex-1'>
          {title}
        </span>
        {badge}
      </button>
      {open && <div className='px-3 pb-2'>{children}</div>}
    </div>
  )
}

function SystemPromptEditor() {
  const draft = useDevtoolsStore((s) => s.editDraft)
  const snapshot = useDevtoolsStore((s) => s.currentSnapshot)
  const updateDraftSystemPrompt = useDevtoolsStore((s) => s.updateDraftSystemPrompt)

  const isModified = draft.systemPrompt !== snapshot?.systemPrompt

  return (
    <Section
      title='System Prompt'
      badge={isModified ? <span className='w-1.5 h-1.5 rounded-full bg-amber-400' /> : null}
    >
      <textarea
        value={draft.systemPrompt ?? ''}
        onChange={(e) => updateDraftSystemPrompt(e.target.value)}
        className={`w-full h-24 text-[11px] font-mono p-2 border rounded resize-y bg-white ${
          isModified ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-200'
        }`}
        placeholder='(no system prompt in snapshot)'
      />
    </Section>
  )
}

function MessagesEditor() {
  const snapshot = useDevtoolsStore((s) => s.currentSnapshot)
  const draft = useDevtoolsStore((s) => s.editDraft)
  const toggleDraftRemoveMessage = useDevtoolsStore((s) => s.toggleDraftRemoveMessage)
  const addDraftInjectMessage = useDevtoolsStore((s) => s.addDraftInjectMessage)
  const removeDraftInjectMessage = useDevtoolsStore((s) => s.removeDraftInjectMessage)
  const [injectRole, setInjectRole] = useState<'user' | 'system'>('user')
  const [injectContent, setInjectContent] = useState('')

  const removed = draft.removeMessageIndices ?? []
  const injected = draft.injectMessages ?? []
  const messages = snapshot?.messagesSummary ?? []
  const hasChanges = removed.length > 0 || injected.length > 0

  const handleInject = () => {
    if (!injectContent.trim()) {
      return
    }
    addDraftInjectMessage(injectRole, injectContent.trim())
    setInjectContent('')
  }

  return (
    <Section
      title={`Messages (${messages.length})`}
      badge={hasChanges ? <span className='w-1.5 h-1.5 rounded-full bg-amber-400' /> : null}
    >
      <div className='max-h-40 overflow-y-auto space-y-0.5'>
        {messages.map((msg) => {
          const isRemoved = removed.includes(msg.index)
          return (
            <label
              key={msg.index}
              className={`flex items-center gap-1.5 py-0.5 cursor-pointer ${
                isRemoved ? 'opacity-40 line-through' : ''
              }`}
            >
              <input
                type='checkbox'
                checked={!isRemoved}
                onChange={() => toggleDraftRemoveMessage(msg.index)}
                className='w-3 h-3 rounded border-gray-300'
              />
              <span className='text-[10px] font-mono text-gray-400 w-5'>#{msg.index}</span>
              <span
                className={`text-[10px] font-medium px-1 rounded ${
                  msg.role === 'user'
                    ? 'bg-blue-100 text-blue-700'
                    : msg.role === 'assistant'
                      ? 'bg-green-100 text-green-700'
                      : msg.role === 'tool_result'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-gray-100 text-gray-600'
                }`}
              >
                {msg.role}
              </span>
              <span className='text-[10px] text-gray-600 truncate flex-1'>{msg.preview}</span>
            </label>
          )
        })}
      </div>

      {/* Injected messages */}
      {injected.length > 0 && (
        <div className='mt-1 space-y-0.5'>
          {injected.map((msg, i) => (
            <div key={i} className='flex items-center gap-1.5 py-0.5 bg-emerald-50 rounded px-1'>
              <span className='text-[10px] text-emerald-600 font-medium'>+ {msg.role}</span>
              <span className='text-[10px] text-emerald-700 truncate flex-1'>{msg.content}</span>
              <button
                onClick={() => removeDraftInjectMessage(i)}
                className='text-[10px] text-red-400 hover:text-red-600'
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Inject form */}
      <div className='mt-1.5 flex items-center gap-1'>
        <select
          value={injectRole}
          onChange={(e) => setInjectRole(e.target.value as 'user' | 'system')}
          className='text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white'
        >
          <option value='user'>user</option>
          <option value='system'>system</option>
        </select>
        <input
          value={injectContent}
          onChange={(e) => setInjectContent(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleInject()}
          placeholder='inject message...'
          className='flex-1 text-[10px] border border-gray-200 rounded px-1.5 py-0.5'
        />
        <button
          onClick={handleInject}
          disabled={!injectContent.trim()}
          className='p-0.5 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30'
        >
          <Plus className='w-3 h-3' />
        </button>
      </div>
    </Section>
  )
}

function LlmParamsEditor() {
  const draft = useDevtoolsStore((s) => s.editDraft)
  const snapshot = useDevtoolsStore((s) => s.currentSnapshot)
  const updateParam = useDevtoolsStore((s) => s.updateDraftLlmParam)

  const isModified = JSON.stringify(draft.llmParams) !== JSON.stringify(snapshot?.llmParams)

  return (
    <Section
      title='LLM Params'
      badge={isModified ? <span className='w-1.5 h-1.5 rounded-full bg-amber-400' /> : null}
    >
      <div className='space-y-1.5'>
        <div className='flex items-center gap-2'>
          <label className='text-[10px] text-gray-500 w-20'>Temperature</label>
          <input
            type='range'
            min='0'
            max='2'
            step='0.1'
            value={draft.llmParams?.temperature ?? snapshot?.llmParams?.temperature ?? 0.7}
            onChange={(e) => updateParam('temperature', Number(e.target.value))}
            className='flex-1 h-1 accent-blue-500'
          />
          <span className='text-[10px] font-mono text-gray-700 w-6 text-right'>
            {(draft.llmParams?.temperature ?? snapshot?.llmParams?.temperature ?? 0.7).toFixed(1)}
          </span>
        </div>
        <div className='flex items-center gap-2'>
          <label className='text-[10px] text-gray-500 w-20'>Max Tokens</label>
          <input
            type='number'
            value={draft.llmParams?.maxTokens ?? snapshot?.llmParams?.maxTokens ?? ''}
            onChange={(e) =>
              updateParam('maxTokens', e.target.value ? Number(e.target.value) : undefined)
            }
            placeholder='default'
            className='flex-1 text-[10px] font-mono border border-gray-200 rounded px-1.5 py-0.5'
          />
        </div>
        <div className='flex items-center gap-2'>
          <label className='text-[10px] text-gray-500 w-20'>Thinking</label>
          <select
            value={draft.llmParams?.thinkingLevel ?? snapshot?.llmParams?.thinkingLevel ?? ''}
            onChange={(e) => updateParam('thinkingLevel', e.target.value || undefined)}
            className='flex-1 text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white'
          >
            <option value=''>default</option>
            <option value='off'>Off</option>
            <option value='low'>Low</option>
            <option value='medium'>Medium</option>
            <option value='high'>High</option>
          </select>
        </div>
      </div>
    </Section>
  )
}

export function ContextEditor() {
  const paused = useDevtoolsStore((s) => s.paused)
  const resetDraft = useDevtoolsStore((s) => s.resetDraft)

  if (!paused) {
    return null
  }

  return (
    <div className='border-b border-gray-200'>
      <div className='flex items-center justify-between px-3 py-1 bg-gray-50'>
        <span className='text-[11px] font-semibold text-gray-500 uppercase tracking-wider'>
          Context Editor
        </span>
        <button
          onClick={resetDraft}
          className='p-1 rounded hover:bg-gray-200 text-gray-400'
          title='Reset all changes'
        >
          <RotateCcw className='w-3 h-3' />
        </button>
      </div>
      <SystemPromptEditor />
      <MessagesEditor />
      <LlmParamsEditor />
    </div>
  )
}
