import ActionButton from '@/components/action-button'
import Tooltip from '@/components/ui/tooltip'
import { useClipboard } from '@/hooks/use-clipboard'
import { clsx } from 'clsx'
import * as React from 'react'
import type { InputProps } from '@/components/input'

interface InputWithCopyProps extends Omit<InputProps, 'showClearIcon' | 'onCopy'> {
  showCopyButton?: boolean
  copyValue?: string 
  onCopy?: (value: string) => void
}

export const InputWithCopy: React.FC<InputWithCopyProps> = React.forwardRef<HTMLInputElement, InputWithCopyProps>(({
  showCopyButton = true,
  copyValue,
  onCopy,
  value,
  wrapperClassName,
  ...inputProps
}, ref) => {
  const valueToString = typeof value === 'string' ? value : String(value || '')
  const finalCopyValue = copyValue || valueToString

  const { copied, copy, reset } = useClipboard()

  const handleCopy = () => {
    copy(finalCopyValue)
    onCopy?.(finalCopyValue)
  }

  const tooltipText = copied
    ? 'Copied'
    : 'Copy'
  
  const safeTooltipText = tooltipText || ''

  return (
    <div className={clsx('relative w-full', wrapperClassName)}>
      <input
        ref={ref}
        className={clsx(
          'w-full appearance-none border border-transparent bg-components-input-bg-normal py-[7px] text-components-input-text-filled caret-primary-600 outline-hidden placeholder:text-components-input-text-placeholder hover:border-components-input-border-hover hover:bg-components-input-bg-hover focus:border-components-input-border-active focus:bg-components-input-bg-active focus:shadow-xs',
          'px-3 system-sm-regular radius-md',
          showCopyButton && 'pr-8',
          inputProps.disabled && 'cursor-not-allowed border-transparent bg-components-input-bg-disabled text-components-input-text-filled-disabled hover:border-transparent hover:bg-components-input-bg-disabled',
          inputProps.className,
        )}
        value={value}
        {...(({ size: _size, ...rest }) => rest)(inputProps)}
      />
      {
        showCopyButton && <div
          className="absolute right-2 top-1/2 -translate-y-1/2"
          onMouseLeave={reset}
          data-testid="copy-button-wrapper"
        >
          <Tooltip
            popupContent={safeTooltipText}
          >
            <ActionButton
              size="xs"
              onClick={handleCopy}
              className="hover:bg-components-button-ghost-bg-hover"
            >
              {copied
                ? (<span className="i-ri-clipboard-fill h-3.5 w-3.5 text-text-tertiary" data-testid="copied-icon" />)
                : (<span className="i-ri-clipboard-line h-3.5 w-3.5 text-text-tertiary" data-testid="copy-icon" />)}
            </ActionButton>
          </Tooltip>
        </div>
      }
    </div>
  )
})

InputWithCopy.displayName = 'InputWithCopy'

export default InputWithCopy
