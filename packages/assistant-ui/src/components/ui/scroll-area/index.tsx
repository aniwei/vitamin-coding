import clsx from 'clsx'
import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area'
import * as React from 'react'
import styles from './index.module.css'

export const ScrollAreaRoot = BaseScrollArea.Root
type ScrollAreaRootProps = React.ComponentPropsWithRef<typeof BaseScrollArea.Root>

export const ScrollAreaContent = BaseScrollArea.Content

type ScrollAreaSlotClassNames = {
  viewport?: string
  content?: string
  scrollbar?: string
}

type ScrollAreaProps = Omit<ScrollAreaRootProps, 'children'> & {
  children: React.ReactNode
  orientation?: 'vertical' | 'horizontal'
  slotClassNames?: ScrollAreaSlotClassNames
  label?: string
  labelledBy?: string
}

const scrollAreaScrollbarClassName = clsx(
  styles.scrollbar,
  'flex touch-none overflow-clip p-1 opacity-100 transition-opacity select-none motion-reduce:transition-none',
  'pointer-events-none data-hovering:pointer-events-auto',
  'data-scrolling:pointer-events-auto',
  'data-[orientation=vertical]:absolute data-[orientation=vertical]:inset-y-0 data-[orientation=vertical]:w-3 data-[orientation=vertical]:justify-center',
  'data-[orientation=horizontal]:absolute data-[orientation=horizontal]:inset-x-0 data-[orientation=horizontal]:h-3 data-[orientation=horizontal]:items-center',
)

const scrollAreaThumbClassName = clsx(
  'shrink-0 radius-xs bg-state-base-handle transition-[background-color] motion-reduce:transition-none',
  'data-[orientation=vertical]:w-1',
  'data-[orientation=horizontal]:h-1',
)

const scrollAreaViewportClassName = clsx(
  'size-full min-h-0 min-w-0 outline-hidden',
  'focus-visible:ring-1 focus-visible:ring-components-input-border-hover focus-visible:ring-inset',
)

const scrollAreaCornerClassName = 'bg-transparent'

type ScrollAreaViewportProps = React.ComponentPropsWithRef<typeof BaseScrollArea.Viewport>

export function ScrollAreaViewport({
  className,
  ...props
}: ScrollAreaViewportProps) {
  return (
    <BaseScrollArea.Viewport
      className={clsx(scrollAreaViewportClassName, className)}
      {...props}
    />
  )
}

type ScrollAreaScrollbarProps = React.ComponentPropsWithRef<typeof BaseScrollArea.Scrollbar>

export function ScrollAreaScrollbar({
  className,
  ...props
}: ScrollAreaScrollbarProps) {
  return (
    <BaseScrollArea.Scrollbar
      className={clsx(scrollAreaScrollbarClassName, className)}
      {...props}
    />
  )
}

type ScrollAreaThumbProps = React.ComponentPropsWithRef<typeof BaseScrollArea.Thumb>

export function ScrollAreaThumb({
  className,
  ...props
}: ScrollAreaThumbProps) {
  return (
    <BaseScrollArea.Thumb
      className={clsx(scrollAreaThumbClassName, className)}
      {...props}
    />
  )
}

type ScrollAreaCornerProps = React.ComponentPropsWithRef<typeof BaseScrollArea.Corner>

export function ScrollAreaCorner({
  className,
  ...props
}: ScrollAreaCornerProps) {
  return (
    <BaseScrollArea.Corner
      className={clsx(scrollAreaCornerClassName, className)}
      {...props}
    />
  )
}

export function ScrollArea({
  children,
  className,
  orientation = 'vertical',
  slotClassNames,
  label,
  labelledBy,
  ...props
}: ScrollAreaProps) {
  return (
    <ScrollAreaRoot className={className} {...props}>
      <ScrollAreaViewport
        aria-label={label}
        aria-labelledby={labelledBy}
        className={slotClassNames?.viewport}
        role={label || labelledBy ? 'region' : undefined}
      >
        <ScrollAreaContent className={slotClassNames?.content}>
          {children}
        </ScrollAreaContent>
      </ScrollAreaViewport>
      <ScrollAreaScrollbar orientation={orientation} className={slotClassNames?.scrollbar}>
        <ScrollAreaThumb />
      </ScrollAreaScrollbar>
    </ScrollAreaRoot>
  )
}
