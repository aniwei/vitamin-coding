import { clsx } from 'clsx'
import { useCallback } from 'react'

const IndeterminateIcon = () => {
  return (
    <div data-testid="indeterminate-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2.5 6H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  )
}

interface CheckboxProps {
  id?: string
  checked?: boolean
  onCheck?: (event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => void
  className?: string
  disabled?: boolean
  indeterminate?: boolean
}

export const Checkbox: React.FC<CheckboxProps> = ({
  id,
  checked,
  onCheck,
  className,
  disabled,
  indeterminate,
}) => {
  const handleCheck = useCallback((event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      return
    }

    onCheck?.(event)
  }, [disabled, onCheck])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      return
    }

    if (event.key === ' ' || event.key === 'Enter') {
      if (event.key === ' ') {
        event.preventDefault()
      }

      handleCheck(event)
    }
  }, [disabled, handleCheck])

  return (
    <div
      id={id}
      className={clsx(
        'flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center radius-xs shadow-xs shadow-shadow-shadow-3',
        (checked || indeterminate)
          ? 'bg-components-checkbox-bg text-components-checkbox-icon hover:bg-components-checkbox-bg-hover'
          : 'border border-components-checkbox-border bg-components-checkbox-bg-unchecked hover:bg-components-checkbox-bg-unchecked-hover hover:border-components-checkbox-border-hover',
        disabled && (checked || indeterminate)
          ? 'cursor-not-allowed bg-components-checkbox-bg-disabled-checked text-components-checkbox-icon-disabled hover:bg-components-checkbox-bg-disabled-checked'
          : 'cursor-not-allowed border-components-checkbox-border-disabled bg-components-checkbox-bg-disabled hover:border-components-checkbox-border-disabled hover:bg-components-checkbox-bg-disabled',
        className,
      )}
      onClick={handleCheck}
      onKeyDown={handleKeyDown}
      data-testid={`checkbox-${id}`}
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : !!checked}
      aria-disabled={!!disabled}
      tabIndex={disabled ? -1 : 0}
    >
      {!checked && indeterminate && <IndeterminateIcon />}
      {checked && <div className="i-ri-check-line h-3 w-3" />}
    </div>
  )
}

export default Checkbox
