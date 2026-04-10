import clsx from 'clsx'
import { useState } from 'react'
import * as React from 'react'
import { ArrowNarrowLeft } from '@/components/icons/src/vender/line/arrows'
import type { INavSelectorProps } from './nav-selector'
import NavSelector from './nav-selector'
import { Link } from 'react-router-dom'

type INavProps = {
  icon: React.ReactNode
  activeIcon?: React.ReactNode
  text: string
  activeSegment: string | string[]
  link: string
  isApp: boolean
} & INavSelectorProps

const Nav = ({
  icon,
  activeIcon,
  text,
  activeSegment,
  link,
  curNav,
  navigationItems,
  createText,
  onCreate,
  onLoadMore,
  isLoadingMore,
  isApp,
}: INavProps) => {
  const [hovered, setHovered] = useState(false)
  const segment = ''
  const isActivated = Array.isArray(activeSegment) ? activeSegment.includes(segment!) : segment === activeSegment

  return (
    <div className={`
      flex h-8 max-w-[670px] shrink-0 items-center rounded-xl px-0.5 text-sm font-medium max-[1024px]:max-w-[400px]
      ${isActivated && 'bg-components-main-nav-nav-button-bg-active font-semibold shadow-md'}
      ${!curNav && !isActivated && 'hover:bg-components-main-nav-nav-button-bg-hover'}
    `}
    >
      <Link to={link}>
        <div
          onClick={(e) => {
            // Don't clear state if opening in new tab/window
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)
              return
            // setAppDetail()
          }}
          className={clsx('flex h-7 cursor-pointer items-center radius-lg px-2.5', isActivated ? 'text-components-main-nav-nav-button-text-active' : 'text-components-main-nav-nav-button-text', curNav && isActivated && 'hover:bg-components-main-nav-nav-button-bg-active-hover')}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div>
            {
              (hovered && curNav)
                ? <ArrowNarrowLeft className="h-4 w-4" />
                : isActivated
                  ? activeIcon
                  : icon
            }
          </div>
          <div className="ml-2 max-[1024px]:hidden">
            {text}
          </div>
        </div>
      </Link>
      {
        curNav && isActivated && (
          <>
            <div className="font-light text-divider-deep">/</div>
            <NavSelector
              isApp={isApp}
              curNav={curNav}
              navigationItems={navigationItems}
              createText={createText}
              onCreate={onCreate}
              onLoadMore={onLoadMore}
              isLoadingMore={isLoadingMore}
            />
          </>
        )
      }
    </div>
  )
}

export default Nav
