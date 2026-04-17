import clsx from 'clsx'
import NavSelector from './nav-selector'
import { useState } from 'react'
import { ArrowNarrowLeft } from '@/components/icons/line/arrows'
import { Link, useMatch } from 'react-router-dom'
import * as React from 'react'
import type { NavSelectorProps } from './nav-selector'

type NavProps = {
  icon: React.ReactNode
  activeIcon?: React.ReactNode
  text: string
  activeSegment: string | string[]
  link: string
} & NavSelectorProps

export const Nav: React.FC<NavProps> = ({
  icon,
  activeIcon,
  text,
  activeSegment,
  link,
  currentNav,
  navigations,
  createText,
  onCreate,
  onLoadMore,
  loadingMore,
}) => {
  const segment = useMatch('/:segment/*')?.params.segment

  const [hovered, setHovered] = useState(false)
  const isActivated = Array.isArray(activeSegment) ? activeSegment.includes(segment!) : segment === activeSegment

  return (
    <div 
      className={clsx(
        'flex h-8 max-w-[670px] shrink-0 items-center rounded-xl px-0.5 text-sm font-medium max-[1024px]:max-w-[400px]',
        isActivated && 'bg-components-main-nav-nav-button-bg-active font-semibold shadow-md',
        !currentNav && !isActivated && 'hover:bg-components-main-nav-nav-button-bg-hover'
      )}
    >
      <Link to={link}>
        <div
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
              return
            }
            // setAppDetail()
          }}
          className={clsx('flex h-7 cursor-pointer items-center radius-lg px-2.5', isActivated ? 'text-components-main-nav-nav-button-text-active' : 'text-components-main-nav-nav-button-text', currentNav && isActivated && 'hover:bg-components-main-nav-nav-button-bg-active-hover')}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div>
            {
              hovered && currentNav
                ? <ArrowNarrowLeft className="h-4 w-4" />
                : isActivated
                  ? activeIcon
                  : icon
            }
          </div>
          <div className="ml-2 max-[1024px]:hidden">{text}</div>
        </div>
      </Link>
      {
        currentNav && isActivated && (
          <>
            <div className="font-light text-divider-deep">/</div>
            <NavSelector
              currentNav={currentNav}
              navigations={navigations}
              createText={createText}
              onCreate={onCreate}
              onLoadMore={onLoadMore}
              loadingMore={loadingMore}
            />
          </>
        )
      }
    </div>
  )
}

Nav.displayName = 'Nav'
export default Nav
