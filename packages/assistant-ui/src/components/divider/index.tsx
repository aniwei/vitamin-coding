import clsx from 'clsx'
import { cva } from 'class-variance-authority'
import * as React from 'react'
import type { VariantProps } from 'class-variance-authority'
import type { CSSProperties, FC } from 'react'

const dv = cva('', {
  variants: {
    type: {
      horizontal: 'my-2 h-[0.5px] w-full',
      vertical: 'mx-2 h-full w-px',
    },
    backgroundStyle: {
      gradient: 'bg-linear-to-r from-divider-regular to-background-gradient-mask-transparent',
      solid: 'bg-divider-regular',
    },
  },
  defaultVariants: {
    type: 'horizontal',
    backgroundStyle: 'solid',
  },
})

type DividerProps = {
  className?: string
  style?: CSSProperties
} & VariantProps<typeof dv> 

export const Divider: FC<DividerProps> = ({ type, backgroundStyle, className = '', style }) => {
  return <div className={clsx(dv({ type, backgroundStyle }), 'shrink-0', className)} style={style} data-testid="divider"></div>
}

Divider.displayName = 'Divider'
export default Divider
