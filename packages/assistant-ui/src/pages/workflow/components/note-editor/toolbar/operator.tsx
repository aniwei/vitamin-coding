import { ShortcutsName } from '@/components/shortcuts-name'
import { RiMoreFill } from '@remixicon/react'
import { memo, useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { clsx } from 'clsx'


export interface OperatorProps {
  onCopy: () => void
  onDuplicate: () => void
  onDelete: () => void
  showAuthor: boolean
  onShowAuthorChange: (showAuthor: boolean) => void
}

const Operator: React.FC<OperatorProps> = memo(({
  onCopy,
  onDelete,
  onDuplicate,
  showAuthor,
  onShowAuthorChange,
}) => {
  const [open, setOpen] = useState(false)

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger
        render={(
          <div
            className={clsx(
              'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-tertiary hover:bg-state-base-hover hover:text-text-secondary',
              open && 'bg-state-base-hover text-text-secondary',
            )}
          >
            <RiMoreFill className="h-4 w-4" />
          </div>
        )}
      />
      <PopoverContent
        placement="bottom-end"
        sideOffset={4}
        popupClassName="border-none bg-transparent p-0 shadow-none"
      >
        <div className="min-w-[192px] rounded-md border-[0.5px] border-components-panel-border bg-components-panel-bg-blur shadow-xl">
          <div className="p-1">
            <div
              className="flex h-8 cursor-pointer items-center justify-between rounded-md px-3 text-sm text-text-secondary hover:bg-state-base-hover"
              onClick={() => {
                onCopy()
                setOpen(false)
              }}
            >
              Copy
              <ShortcutsName keys={['ctrl', 'c']} />
            </div>
            <div
              className="flex h-8 cursor-pointer items-center justify-between rounded-md px-3 text-sm text-text-secondary hover:bg-state-base-hover"
              onClick={() => {
                onDuplicate()
                setOpen(false)
              }}
            >
              Duplicate
              <ShortcutsName keys={['ctrl', 'd']} />
            </div>
          </div>
          <div className="h-px bg-divider-subtle"></div>
          <div className="p-1">
            <div
              className="flex h-8 cursor-pointer items-center justify-between rounded-md px-3 text-sm text-text-secondary hover:bg-state-base-hover"
              onClick={e => e.stopPropagation()}
            >
              <div>Show Author</div>
              <button
                type="button"
                role="switch"
                aria-checked={showAuthor}
                className={clsx(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                  showAuthor ? 'bg-components-switch-bg-selected' : 'bg-components-switch-bg-unselected',
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  onShowAuthorChange(!showAuthor)
                }}
              >
                <span
                  className={clsx(
                    'inline-block h-4 w-4 rounded-full bg-components-switch-handle shadow-sm transition-transform',
                    showAuthor ? 'translate-x-4' : 'translate-x-0.5',
                  )}
                />
              </button>
            </div>
          </div>
          <div className="h-px bg-divider-subtle"></div>
          <div className="p-1">
            <div
              className="flex h-8 cursor-pointer items-center justify-between rounded-md px-3 text-sm text-text-secondary hover:bg-state-destructive-hover hover:text-text-destructive"
              onClick={() => {
                onDelete()
                setOpen(false)
              }}
            >
              Delete
              <ShortcutsName keys={['del']} />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
})

export default Operator
