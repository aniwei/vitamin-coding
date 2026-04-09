'use client'

import clsx from 'clsx'
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import * as React from 'react'
import type { Placement } from '../../placement'
import { parsePlacement } from '../../placement'

type TooltipContentVariant = 'default' | 'plain'

type TooltipContentProps = {
  children: React.ReactNode
  placement?: Placement
  sideOffset?: number
  alignOffset?: number
  className?: string
  popupClassName?: string
  variant?: TooltipContentVariant
} & Omit<React.ComponentPropsWithoutRef<typeof BaseTooltip.Popup>, 'children' | 'className'>

export function TooltipContent({
  children,
  placement = 'top',
  sideOffset = 8,
  alignOffset = 0,
  className,
  popupClassName,
  variant = 'default',
  ...props
}: TooltipContentProps) {
  const { side, align } = parsePlacement(placement)

  return (
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className={clsx('z-1002 outline-hidden', className)}
      >
        <BaseTooltip.Popup
          className={clsx(
            variant === 'default' && 'max-w-[300px] rounded-md bg-components-panel-bg px-3 py-2 text-left system-xs-regular wrap-break-word text-text-tertiary shadow-lg',
            'origin-(--transform-origin) transition-opacity data-ending-style:opacity-0 data-instant:transition-none data-starting-style:opacity-0 motion-reduce:transition-none',
            popupClassName,
          )}
          {...props}
        >
          {children}
        </BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  )
}

export const TooltipProvider = BaseTooltip.Provider
export const Tooltip = BaseTooltip.Root
export const TooltipTrigger = BaseTooltip.Trigger
