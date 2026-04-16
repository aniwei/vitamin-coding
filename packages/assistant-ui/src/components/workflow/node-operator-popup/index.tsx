import clsx from 'clsx'
import OperatorPopup from './operator-popup'
import { RiMoreFill } from '@remixicon/react'
import {
  memo,
  useCallback,
  useState,
} from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { OffsetOptions } from '@floating-ui/react'
import type { Node } from '../types'

type OperatorProps = {
  id: string
  data: Node['data']
  triggerClassName?: string
  offset?: OffsetOptions
  onOpenChange?: (open: boolean) => void
  inNode?: boolean
  showHelpLink?: boolean
}

function isOffsetObject(value: OffsetOptions): value is { mainAxis?: number, crossAxis?: number } {
  return typeof value === 'object' && value !== null
}

export const Operator: React.FC<OperatorProps> = ({
  id,
  data,
  triggerClassName,
  offset = {
    mainAxis: 4,
    crossAxis: 53,
  },
  onOpenChange,
  showHelpLink = true,
}) => {
  const [open, setOpen] = useState(false)
  const sideOffset = typeof offset === 'number' ? offset : (isOffsetObject(offset) ? (offset.mainAxis ?? 0) : 0)
  const alignOffset = isOffsetObject(offset) ? (offset.crossAxis ?? 0) : 0

  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen)

    if (onOpenChange) {
      onOpenChange(newOpen)
    }
  }, [onOpenChange])

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
    >
      <PopoverTrigger
        onClick={() => handleOpenChange(!open)}
        render={(
          <div
            className={clsx(
              'flex h-6 w-6 cursor-pointer items-center justify-center rounded-md',
              'hover:bg-state-base-hover',
              open && 'bg-state-base-hover',
              triggerClassName
            )}
          >
            <RiMoreFill className="h-4 w-4 text-text-tertiary" />
          </div>
        )}
      />
      <PopoverContent
        placement="bottom-end"
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="z-11"
        popupClassName="border-none bg-transparent p-0 shadow-none"
      >
        <OperatorPopup
          id={id}
          data={data}
          onClosePopup={() => handleOpenChange(false)}
          showHelpLink={showHelpLink}
        />
      </PopoverContent>
    </Popover>
  )
}

Operator.displayName = 'Operator'
export default Operator
