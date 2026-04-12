import Button from '@/components/button'

import { clsx } from 'clsx'
import { RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ShortcutsName } from '@/components/shortcuts-name'
import * as React from 'react'

interface ToggleTooltipContentProps {
  expand: boolean
}

const ToggleTooltipContent = ({
  expand,
}: ToggleTooltipContentProps) => {

  return (
    <div className="flex items-center gap-x-1">
      <span className="px-0.5 text-text-secondary system-xs-medium">{expand ? 'Collapse Sidebar' : 'Expand Sidebar'}</span>
      <ShortcutsName keys={['ctrl', 'B']} textColor="secondary" />
    </div>
  )
}

interface ToggleButtonProps {
  expand: boolean
  handleToggle: () => void
  className?: string
}

const ToggleButton = React.memo(({
  expand,
  handleToggle,
  className,
}: ToggleButtonProps) => {
  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <Button
            size="small"
            onClick={handleToggle}
            className={clsx('rounded-full px-1', className)}
          >
            {
              expand
                ? <RiArrowLeftSLine className="size-4" />
                : <RiArrowRightSLine className="size-4" />
            }
          </Button>
        )}
      />
      <TooltipContent
        placement="right"
        popupClassName="rounded-lg p-1.5"
      >
        <ToggleTooltipContent expand={expand} />
      </TooltipContent>
    </Tooltip>
  )
})

export default ToggleButton
