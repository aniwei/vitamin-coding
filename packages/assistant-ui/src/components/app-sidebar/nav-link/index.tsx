import { clsx } from 'clsx'
import { Link, useMatch } from 'react-router-dom'
import * as React from 'react'
import type { RemixiconComponentType } from '@remixicon/react'

export type NavIcon = React.ComponentType<
  React.PropsWithoutRef<React.ComponentProps<'svg'>> & {
    title?: string | undefined
    titleId?: string | undefined
  }
> | RemixiconComponentType

export type NavLinkProps = {
  name: string
  href: string
  icons: {
    selected: NavIcon
    normal: NavIcon
  }
  mode?: string
  disabled?: boolean
}

const Icon: React.FC<{ mode: string; icon: NavIcon }> = ({ mode, icon }) => (
  <div className={clsx(mode !== 'expand' && '-ml-1')}>
    {/* <icon className="h-4 w-4 shrink-0" aria-hidden="true" /> */}
  </div>
)

const NavLink = ({
  name,
  href,
  icons,
  mode = 'expand',
  disabled = false,
}: NavLinkProps) => {
  // TODO
  const formattedSegment = 'logs'
  const isActive = href.toLowerCase().split('/')?.pop() === formattedSegment
  const icon = isActive 
    ? icons.selected 
    : icons.normal

  if (disabled) {
    return (
      <button
        key={name}
        type="button"
        disabled
        className={clsx('flex h-8 cursor-not-allowed items-center rounded-lg text-components-menu-item-text opacity-30 system-sm-medium hover:bg-components-menu-item-bg-hover', 'pl-3 pr-1')}
        title={mode === 'collapse' ? name : ''}
        aria-disabled
      >
        <Icon mode={mode} icon={icon} />
        <span
          className={clsx('overflow-hidden whitespace-nowrap transition-all duration-200 ease-in-out', mode === 'expand'
            ? 'ml-2 max-w-none opacity-100'
            : 'ml-0 max-w-0 opacity-0')}
        >
          {name}
        </span>
      </button>
    )
  }

  return (
    <Link
      key={name}
      to={href}
      className={clsx(
        isActive
          ? 'border-b-[0.25px] border-l-[0.75px] border-r-[0.25px] border-t-[0.75px] border-effects-highlight-lightmode-off bg-components-menu-item-bg-active text-text-accent-light-mode-only system-sm-semibold'
          : 'text-components-menu-item-text system-sm-medium hover:bg-components-menu-item-bg-hover hover:text-components-menu-item-text-hover', 'flex h-8 items-center rounded-lg pl-3 pr-1'
      )}
      title={mode === 'collapse' ? name : ''}
    >
      <Icon mode={mode} icon={icon} />
      <span
        className={clsx('overflow-hidden whitespace-nowrap transition-all duration-200 ease-in-out', mode === 'expand'
          ? 'ml-2 max-w-none opacity-100'
          : 'ml-0 max-w-0 opacity-0')}
      >
        {name}
      </span>
    </Link>
  )
}

export default React.memo(NavLink)
