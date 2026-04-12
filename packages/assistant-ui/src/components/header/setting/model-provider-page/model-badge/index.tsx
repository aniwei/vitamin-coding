import type { FC, ReactNode } from 'react'
import clsx from 'clsx'

type ModelBadgeProps = {
  className?: string
  children?: ReactNode
}
const ModelBadge: FC<ModelBadgeProps> = ({
  className,
  children,
}) => {
  return (
    <div className={clsx('inline-flex h-[18px] shrink-0 items-center justify-center whitespace-nowrap rounded-[5px] border border-divider-deep bg-components-badge-bg-dimm px-[5px] text-text-tertiary system-2xs-medium-uppercase', className)}>
      {children}
    </div>
  )
}

export default ModelBadge
