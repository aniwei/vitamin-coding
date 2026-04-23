import { clsx } from 'clsx'
import { memo, useRef } from 'react'
import { NoteEditor, NoteEditorContextProvider } from './note-editor'
import type { NodeProps } from 'reactflow'
import type { NoteNodeType, NoteThemeShape } from './types'

type NoteNodeProps = {
  theme: NoteThemeShape
} & NodeProps<NoteNodeType>

export const NoteNode: React.FC<NoteNodeProps> = memo(({
  data,
  theme,
}) => {
  const ref = useRef<HTMLDivElement | null>(null)

  return (
    <div
      ref={ref}
      className={clsx(
        'relative flex flex-col rounded-md border shadow-xs hover:shadow-md',
        theme.background,
        data.selected ? theme.border : 'border-black/5',
      )}
      style={{
        width: data.width,
        height: data.height,
      }}
    >
      <NoteEditorContextProvider
        value={data.text}
        editable={false}
      >
        <>
          <div
            className={clsx(
              'h-2 shrink-0 rounded-t-md opacity-50',
              theme.title,
            )}
          >
          </div>
          <div className="grow overflow-y-auto px-3 py-2.5">
            <div className={clsx(data.selected && 'nodrag nopan nowheel cursor-text')}>
              <NoteEditor
                containerElement={ref.current}
                placeholder=""
              />
            </div>
          </div>
          {
            data.showAuthor && <div className="p-3 pt-0 text-xs text-text-tertiary">
              {data.author}
            </div>
          }
        </>
      </NoteEditorContextProvider>
    </div>
  )
})

NoteNode.displayName = 'NoteNode'
export default NoteNode
