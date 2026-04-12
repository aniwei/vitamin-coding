import clsx from 'clsx'
import Spinner from '../spinner'
import { Button as BaseButton } from '@base-ui/react/button'
import { cva } from 'class-variance-authority'
import * as React from 'react'
import type { VariantProps } from 'class-variance-authority'

const bv = cva('btn', {
  variants: {
    variant: {
      'primary': 'btn-primary',
      'warning': 'btn-warning',
      'secondary': 'btn-secondary',
      'secondary-accent': 'btn-secondary-accent',
      'ghost': 'btn-ghost',
      'ghost-accent': 'btn-ghost-accent',
      'tertiary': 'btn-tertiary',
    },
    size: {
      small: 'btn-small',
      medium: 'btn-medium',
      large: 'btn-large',
    },
    destructive: {
      true: 'btn-destructive',
    },
  },
  defaultVariants: {
    variant: 'secondary',
    size: 'medium',
  },
})

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof bv> {
  loading?: boolean
  spinnerClassName?: string
  ref?: React.Ref<HTMLButtonElement>
  render?: React.ReactElement
  focusableWhenDisabled?: boolean
}

export const Button = ({
  className,
  variant,
  size,
  destructive,
  loading,
  children,
  spinnerClassName,
  ref,
  render,
  focusableWhenDisabled,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) => {
  const isDisabled = disabled || loading

  return (
    <BaseButton
      type={type}
      className={clsx(bv({ variant, size, destructive, className }))}
      ref={ref}
      render={render}
      {...props}
      disabled={isDisabled}
      focusableWhenDisabled={focusableWhenDisabled}
      aria-busy={loading || undefined}
    >
      {children}
      {loading && <Spinner loading={loading} className={clsx('ml-1! h-3! w-3! border-2! text-white!', spinnerClassName)} />}
    </BaseButton>
  )
}

Button.displayName = 'Button'

export default Button
export { bv }
