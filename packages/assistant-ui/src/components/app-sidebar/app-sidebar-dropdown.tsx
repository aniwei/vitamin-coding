import type { NavIcon } from './nav-link'
import {
  RiEqualizer2Line,
  RiMenuLine,
} from '@remixicon/react'
import * as React from 'react'
import { useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { clsx } from 'clsx'
import Divider from '@/components/divider'
import AppInfo from './app-info'
import { getAppModeLabel } from './app-info/app-mode-labels'
import NavLink from './nav-link'

type Props = {
  navigation: Array<{
    name: string
    href: string
    icon: NavIcon
    selectedIcon: NavIcon
  }>
}

const AppSidebarDropdown = ({ navigation }: Props) => {
  const [detailExpand, setDetailExpand] = useState(false)

  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="fixed left-2 top-2 z-20">
        <Popover
          open={open}
          onOpenChange={setOpen}
        >
          <PopoverTrigger
            render={(
              <div className={clsx('flex cursor-pointer items-center radius-lg border-[0.5px] border-components-actionbar-border bg-components-actionbar-bg p-1 shadow-lg backdrop-blur-xs hover:bg-background-default-hover', open && 'bg-background-default-hover')}>
                <RiMenuLine className="h-4 w-4 text-text-tertiary" />
              </div>
            )}
          />
          <PopoverContent
            placement="bottom-start"
            sideOffset={-41}
            className="z-1000"
            popupClassName="border-none bg-transparent p-0 shadow-none"
          >
            <div className={clsx('w-[305px] rounded-xl border-[0.5px] border-components-panel-border bg-background-default-subtle shadow-lg')}>
              <div className="p-2">
                <div
                  className={clsx('flex flex-col gap-2 rounded-lg p-2 pb-2.5', 'cursor-pointer hover:bg-state-base-hover')}
                  onClick={() => {
                    setDetailExpand(true)
                    setOpen(false)
                  }}
                >
                  <div className="flex items-center justify-between self-stretch">
                    <div className="flex items-center justify-center rounded-md p-0.5">
                      <div className="flex h-5 w-5 items-center justify-center">
                        <RiEqualizer2Line className="h-4 w-4 text-text-tertiary" />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-start gap-1">
                    <div className="flex w-full">
                      <div className="truncate text-text-secondary system-md-semibold">TODO</div>
                    </div>
                    <div className="text-text-tertiary system-2xs-medium-uppercase">{getAppModeLabel(appDetail.mode, t)}</div>
                  </div>
                </div>
              </div>
              <div className="px-4">
                <Divider backgroundStyle="gradient" />
              </div>
              <nav className="space-y-0.5 px-3 pb-6 pt-4">
                {navigation.map((item, index) => {
                  return (
                    <NavLink key={index} mode="expand" icons={{ selected: item.selectedIcon, normal: item.icon }} name={item.name} href={item.href} />
                  )
                })}
              </nav>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="z-20">
        <AppInfo expand onlyShowDetail openState={detailExpand} onDetailExpand={setDetailExpand} />
      </div>
    </>
  )
}

export default AppSidebarDropdown
