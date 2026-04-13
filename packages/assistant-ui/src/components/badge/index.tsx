import { cva } from 'class-variance-authority'
import { clsx } from 'clsx'
import * as React from 'react'
import type { VariantProps } from 'class-variance-authority'
import type { CSSProperties, ReactNode } from 'react'

enum BadgeState {
  Warning = 'warning',
  Accent = 'accent',
  Default = '',
}

const bv = cva('badge', {
  variants: {
    size: {
      s: 'badge-s',
      m: 'badge-m',
      l: 'badge-l',
    },
  },
  defaultVariants: {
    size: 'm',
  },
})

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof bv> {
  size?: 's' | 'm' | 'l'
  iconOnly?: boolean
  uppercase?: boolean
  state?: BadgeState
  styleCss?: CSSProperties
  children?: ReactNode
}

function getBadgeState(state: BadgeState) {
  switch (state) {
    case BadgeState.Warning:
      return 'badge-warning'
    case BadgeState.Accent:
      return 'badge-accent'
    default:
      return ''
  }
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  size,
  state = BadgeState.Default,
  iconOnly = false,
  uppercase = false,
  style,
  children,
  ...props
}) => {
  return (
    <div
      style={style}
      className={clsx(
        bv({ size, className }), 
        getBadgeState(state), 
        size === 's'
          ? iconOnly ? 'p-[3px]' : 'px-[5px] py-[3px]'
          : size === 'l'
            ? iconOnly ? 'p-1.5' : 'px-2 py-1'
            : iconOnly ? 'p-1' : 'px-[5px] py-[2px]', uppercase ? 'system-2xs-medium-uppercase' : 'system-2xs-medium')}
      {...props}
    >{children}</div>
  )
}

Badge.displayName = 'Badge'

export default Badge
export { BadgeState, bv }
