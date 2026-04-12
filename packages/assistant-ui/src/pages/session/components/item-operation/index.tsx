
import {
  RiDeleteBinLine,
  RiEditLine,
} from '@remixicon/react'
import { useBoolean } from 'ahooks'
import { useEffect, useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { clsx } from 'clsx'
import { Pin02 } from '@/components/icons/src/vender/line/general'
import * as React from 'react'
import type { FC } from 'react'
import s from './index.module.css'

interface ItemOperationProps {
  className?: string
  hovering?: boolean
  pinned: boolean
  showRenameConversation?: boolean
  showDelete: boolean
  onRenameConversation?: () => void
  pin: () => void
  onDelete: () => void
}

export const ItemOperation: FC<ItemOperationProps> = ({
  className,
  hovering,
  pinned,
  showRenameConversation,
  showDelete,
  pin,
  onRenameConversation,
  onDelete,
}) => {
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  const [isHovering, { setTrue: setIsHovering, setFalse: setNotHovering }] = useBoolean(false)
  
  useEffect(() => {
    if (!hovering && !isHovering)
      setOpen(false)
  }, [hovering, isHovering])
  
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger
        onClick={() => setOpen(v => !v)}
        render={(
          <div
            className={clsx(className, s.btn, 'h-6 w-6 rounded-md border-none py-1', (hovering || open) && `${s.open} bg-components-actionbar-bg! shadow-none!`)}
            data-testid="item-operation-trigger"
          >
          </div>
        )}
      >
      </PopoverTrigger>
      <PopoverContent
        placement="bottom-end"
        sideOffset={4}
        className="z-50"
        popupClassName="border-none bg-transparent p-0 shadow-none"
      >
        <div
          ref={ref}
          className="min-w-[120px] rounded-lg border border-components-panel-border bg-components-panel-bg-blur p-1 shadow-lg backdrop-blur-[5px]"
          onMouseEnter={setIsHovering}
          onMouseLeave={setNotHovering}
          onClick={(e) => {
            e.stopPropagation()
          }}
        >
          <div className={clsx(s.actionItem, 'group hover:bg-state-base-hover')} onClick={pin}>
            <Pin02 className="h-4 w-4 shrink-0 text-text-secondary" />
            <span className={s.actionName}>
              { pinned ? 'Unpin' : 'Pin to top' }
            </span>
          </div>
          {
            showRenameConversation && (
              <div className={clsx(s.actionItem, 'group hover:bg-state-base-hover')} onClick={onRenameConversation}>
                <RiEditLine className="h-4 w-4 shrink-0 text-text-secondary" />
                <span className={s.actionName}>Rename</span>
              </div>
            )
          }

          {
            showDelete && (
              <div className={clsx(s.actionItem, s.deleteActionItem, 'group hover:bg-state-base-hover')} onClick={onDelete}>
                <RiDeleteBinLine className={clsx(s.deleteActionItemChild, 'h-4 w-4 shrink-0 stroke-current stroke-2 text-text-secondary')} />
                <span className={clsx(s.actionName, s.deleteActionItemChild)}>Delete</span>
              </div>
            )
          }
        </div>
      </PopoverContent>
    </Popover>
  )
}
export default React.memo(ItemOperation)
