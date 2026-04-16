import Divider from '@/components/divider'
import AppInfo from './app-info'
// import AppSidebarDropdown from './app-sidebar-dropdown'
import DatasetInfo from './dataset-info'
// import DatasetSidebarDropdown from './dataset-sidebar-dropdown'
import NavLink from './nav-link'
import ToggleButton from './toggle-button'
import { useHover, useKeyPress } from 'ahooks'
import { useCallback, useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { getKeyboardKeyCodeBySystem } from '@/shared/keyboard'
import * as React from 'react'
import type { NavIcon } from './nav-link'
import { useLocation } from 'react-router-dom'
import Trigger from './trigger'

interface AppSidebarProps {
  iconType?: 'app' | 'dataset'
  navigation: Array<{
    name: string
    href: string
    icon: NavIcon
    selectedIcon: NavIcon
    disabled?: boolean
  }>
  extraInfo?: (modeState: string) => React.ReactNode
}

const AppSidebar: React.FC<AppSidebarProps> = ({
  navigation
}) => {
  const sidebarRef = React.useRef<HTMLDivElement>(null)
  // TODO
  const expand = false

  const onToggle = useCallback(() => {
  }, [])

  const pathname = useLocation().pathname
  const inWorkflowCanvas = pathname.endsWith('/workflow')
  const isPipelineCanvas = pathname.endsWith('/pipeline')
  const workflowCanvasMaximize = localStorage.getItem('workflow-canvas-maximize') === 'true'
  const [hideHeader, setHideHeader] = useState(workflowCanvasMaximize)

  // TODO
  // const { eventBus } = useEventBus()
  // eventBus?.useSubscription((v: any) => {
  //   if (v?.type === 'workflow-canvas-maximize') {
  //     setHideHeader(v.payload)
  //   }
  // })

  useKeyPress(`${getKeyboardKeyCodeBySystem('ctrl')}.b`, (e) => {
    e.preventDefault()
    onToggle()
  }, { exactMatch: true, useCapture: true })

  if (inWorkflowCanvas && hideHeader) {
    return (
      <div className="flex w-0 shrink-0">
        {/* <AppSidebarDropdown navigation={navigation} /> */}
      </div>
    )
  }

  if (isPipelineCanvas && hideHeader) {
    return (
      <div className="flex w-0 shrink-0">
        {/* <DatasetSidebarDropdown navigation={navigation} /> */}
      </div>
    )
  }

  return (
    <div
      ref={sidebarRef}
      className={clsx(
        'flex shrink-0 flex-col border-r border-divider-burn bg-background-default-subtle transition-all',
        expand ? 'w-[216px]' : 'w-14',
      )}
    >
      <div
        className={clsx(
          'shrink-0',
          expand ? 'p-2' : 'p-1',
        )}
      >
        <Trigger expand={expand} onClick={onToggle} />
      </div>
      <div className="relative px-4 py-2">
        <Divider
          type="horizontal"
          backgroundStyle={expand ? 'gradient' : 'solid'}
          className={clsx('my-0 h-px',
            expand
              ? 'bg-linear-to-r from-divider-subtle to-background-gradient-mask-transparent'
              : 'bg-divider-subtle',
          )}
        />
        
        {/* <ToggleButton
          className="absolute -right-3 top-[-3.5px] z-20"
          expand={expand}
          handleToggle={onToggle}
        /> */}
      </div>
      <nav
        className={clsx('flex grow flex-col gap-y-0.5', expand ? 'px-3 py-2' : 'p-3',)}
      >
        {navigation.map((item, index) => {
          return (
            <NavLink
              key={index}
              mode={expand ? 'full' : 'icon'}
              icons={{ selected: item.selectedIcon, normal: item.icon }}
              name={item.name}
              href={item.href}
              disabled={!!item.disabled}
            />
          )
        })}
      </nav>
    </div>
  )
}

export default AppSidebar
