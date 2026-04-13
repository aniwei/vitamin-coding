import { cva } from 'class-variance-authority'
import { clsx } from 'clsx'
import { memo } from 'react'
import * as React from 'react'
import type { VariantProps } from 'class-variance-authority'
import type { CSSProperties } from 'react'

enum ActionButtonState {
  Destructive = 'destructive',
  Active = 'active',
  Disabled = 'disabled',
  Default = '',
  Hover = 'hover',
}

const abv = cva('action-btn', {
  variants: {
    size: {
      xs: 'action-btn-xs',
      s: 'action-btn-s',
      m: 'action-btn-m',
      l: 'action-btn-l',
      xl: 'action-btn-xl',
    },
  },
  defaultVariants: {
    size: 'm',
  },
})

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof abv> {
  size?: 'xs' | 's' | 'm' | 'l' | 'xl'
  state?: ActionButtonState
  styleCss?: CSSProperties
  ref?: React.Ref<HTMLButtonElement>
}

function getActionButtonState(state: ActionButtonState) {
  switch (state) {
    case ActionButtonState.Destructive:
      return 'action-btn-destructive'
    case ActionButtonState.Active:
      return 'action-btn-active'
    case ActionButtonState.Disabled:
      return 'action-btn-disabled'
    case ActionButtonState.Hover:
      return 'action-btn-hover'
    default:
      return ''
  }
}

export const ActionButton: React.FC<ActionButtonProps> = memo(({ 
  className, 
  size, 
  state = ActionButtonState.Default, 
  styleCss, 
  children, 
  ref, 
  disabled, 
  ...props 
}) => {
  return (
    <button
      type="button"
      ref={ref}
      style={styleCss}
      className={clsx(
        abv({ className, size }),
        getActionButtonState(state),
        disabled && 'cursor-not-allowed text-text-disabled hover:bg-transparent hover:text-text-disabled',
      )}
      disabled={disabled}
      {...props}
    >{children}</button>
  )
})

ActionButton.displayName = 'ActionButton'

export { ActionButtonState, abv }
export default ActionButton
