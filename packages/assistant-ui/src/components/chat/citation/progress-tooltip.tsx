import { useState } from 'react'
import {
  PortalToFollowElem,
  PortalToFollowElemContent,
  PortalToFollowElemTrigger,
} from '@/components/portal-to-follow-elem'
import type { FC } from 'react'

type ProgressTooltipProps = {
  data: number
}

export const ProgressTooltip: FC<ProgressTooltipProps> = ({
  data,
}) => {
  const [open, setOpen] = useState(false)

  return (
    <PortalToFollowElem
      open={open}
      onOpenChange={setOpen}
      placement="top-start"
    >
      <PortalToFollowElemTrigger
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <div className="flex grow items-center">
          <div className="mr-1 h-1.5 w-16 overflow-hidden rounded-[3px] border border-components-progress-gray-border">
            <div
              className="h-full bg-components-progress-gray-progress"
              style={{ width: `${data * 100}%` }}
            >
            </div>
          </div>
          {data}
        </div>
      </PortalToFollowElemTrigger>
      <PortalToFollowElemContent style={{ zIndex: 1001 }}>
        <div className="rounded-lg bg-components-tooltip-bg p-3 text-text-quaternary shadow-lg system-xs-medium">
          Hit Score
          {' '}
          {data}
        </div>
      </PortalToFollowElemContent>
    </PortalToFollowElem>
  )
}

ProgressTooltip.displayName = 'ProgressTooltip'
export default ProgressTooltip
