import { clsx } from 'clsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import * as React from 'react'
import type { FC } from 'react'

interface SyncButtonProps {
  className?: string
  popupContent?: string
  onClick: () => void
}

const SyncButton: FC<SyncButtonProps> = ({
  className,
  popupContent = '',
  onClick,
}) => {
  const canShowTooltip = popupContent.length > 0

  return (
    <Tooltip>
      <TooltipTrigger
        disabled={!canShowTooltip}
        render={(
          <div className={clsx(className, 'cursor-pointer select-none rounded-md p-1 hover:bg-state-base-hover')} onClick={onClick} data-testid="sync-button">
            <span className="i-ri-refresh-line h-4 w-4 text-text-tertiary" />
          </div>
        )}
      />
      {canShowTooltip && (
        <TooltipContent>
          {popupContent}
        </TooltipContent>
      )}
    </Tooltip>
  )
}
export default React.memo(SyncButton)
