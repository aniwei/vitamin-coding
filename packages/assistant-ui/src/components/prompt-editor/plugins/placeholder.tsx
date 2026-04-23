import { memo } from 'react'
import { clsx } from 'clsx'
import type { ReactNode } from 'react'

const Placeholder = ({
  compact,
  value,
  className,
}: {
  compact?: boolean
  value?: ReactNode
  className?: string
}) => {

  return (
    <div className={clsx(
      'pointer-events-none absolute left-0 top-0 h-full w-full select-none text-sm text-components-input-text-placeholder',
      compact ? 'text-[13px] leading-5' : 'text-sm leading-6',
      className,
    )}
    >
      {value || 'Write your note...'}
    </div>
  )
}

export default memo(Placeholder)
