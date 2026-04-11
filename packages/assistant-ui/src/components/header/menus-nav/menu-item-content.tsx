import clsx from 'clsx'
import type { ReactNode } from 'react'

interface MenuItemContentProps {
  iconClassName: string
  label: ReactNode
  trailing?: ReactNode
}

export function MenuItemContent({
  iconClassName,
  label,
  trailing,
}: MenuItemContentProps) {
  return (
    <>
      <span 
        aria-hidden 
        className={clsx(
          'size-4 shrink-0 text-text-tertiary', 
          iconClassName)} 
      />
      <div className="min-w-0 grow truncate px-1 text-text-secondary system-md-regular">{label}</div>
      {trailing}
    </>
  )
}

export function ExternalLinkIndicator() {
  return <span 
    aria-hidden 
    className={clsx(
      'i-ri-arrow-right-up-line', 
      'size-[14px] shrink-0 text-text-tertiary'
    )} 
  />
}
