import type { FC } from 'react'
import * as React from 'react'
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type TooltipProps = {
  data: number | string
  text: string
  icon: React.ReactNode
}

const Tooltip: FC<TooltipProps> = ({
  data,
  text,
  icon,
}) => {
  return (
    <UiTooltip>
      <TooltipTrigger
        render={(
          <div data-testid="tooltip-trigger-content" className="mr-6 flex items-center">
            {icon}
            {data}
          </div>
        )}
      />
      <TooltipContent
        placement="top-start"
        className="z-1001"
        popupClassName="border-none bg-transparent p-0 shadow-none"
      >
        <div data-testid="tooltip-popup" className="rounded-lg bg-components-tooltip-bg p-3 text-text-quaternary shadow-lg system-xs-medium">
          {text}
          {' '}
          {data}
        </div>
      </TooltipContent>
    </UiTooltip>
  )
}

export default Tooltip
