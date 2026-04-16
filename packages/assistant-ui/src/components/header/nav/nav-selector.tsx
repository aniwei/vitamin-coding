import Loading from '@/components/loading'
import { 
  Menu, 
  MenuButton, 
  MenuItem, 
  MenuItems, 
  Transition 
} from '@headlessui/react'
import {
  RiAddLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
} from '@remixicon/react'
import { debounce } from 'es-toolkit/compat'
import { Fragment, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { FileArrow01, FilePlus01, FilePlus02 } from '@/components/icons/line/files'

export interface NavItem {
  id: string
  title: string
  link: string
  // icon_type: AppIconType | null
  icon: string
  icon_background: string | null
  icon_url: string | null
  // mode?: AppModeEnum
}
export interface NavSelectorProps {
  navigations: NavItem[]
  currentNav?: Omit<NavItem, 'link'>
  createText: string
  onCreate: (state: string) => void
  onLoadMore?: () => void
  loadingMore?: boolean
}

export const NavSelector: React.FC<NavSelectorProps> = ({ 
  currentNav, 
  navigations, 
  createText, 
  onCreate, 
  onLoadMore, 
  loadingMore 
}: NavSelectorProps) => {
  const navigate = useNavigate()
 
  const onScroll = () => {}

  return (
    <Menu as="div" className="relative">
      {({ open }) => (
        <>
          <MenuButton 
            className={clsx(
              'hover:hover:bg-components-main-nav-nav-button-bg-active-hover group inline-flex h-7 w-full items-center justify-center radius-lg pl-2 pr-2.5 text-[14px] font-semibold text-components-main-nav-nav-button-text-active',
              open && 'bg-components-main-nav-nav-button-bg-active',
            )}
          >
            <div className="max-w-[157px] truncate" title={currentNav?.title}>{currentNav?.title}</div>
            <RiArrowDownSLine
              className={clsx('ml-1 h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100', open && 'opacity-100!')}
              aria-hidden="true"
            />
          </MenuButton>
          <MenuItems className="absolute -left-11 right-0 mt-1.5 w-60 max-w-80 origin-top-right divide-y divide-divider-regular rounded-lg bg-components-panel-bg-blur shadow-lg">
            <div className="overflow-auto px-1 py-1" style={{ maxHeight: '50vh' }} onScroll={onScroll}>
              {
                navigations.map(nav => (
                  <MenuItem key={nav.id}>
                    <div
                      className="flex w-full cursor-pointer items-center truncate rounded-lg px-3 py-[6px] text-[14px] font-normal text-text-secondary hover:bg-state-base-hover"
                      onClick={() => {
                        if (currentNav?.id === nav.id) {
                          return
                        }

                        navigate(nav.link)
                      }}
                      title={nav.title}
                    >
                      <div className="relative mr-2 h-6 w-6 rounded-md">
                        {/* <AppIcon
                          size="tiny"
                          iconType={nav.icon_type}
                          icon={nav.icon}
                          background={nav.icon_background}
                          imageUrl={nav.icon_url}
                        />
                        {!!nav.mode && (
                          <AppTypeIcon type={nav.mode} wrapperClassName="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 shadow-sm" className="h-2.5 w-2.5" />
                        )} */}
                      </div>
                      <div className="truncate">
                        {nav.title}
                      </div>
                    </div>
                  </MenuItem>
                ))
              }
              {
                loadingMore && <div className="flex justify-center py-2">
                  <Loading />
                </div>
              }
            </div>
              <MenuItem as="div" className="w-full p-1">
              <div
                onClick={() => onCreate('')}
                className={clsx('flex cursor-pointer items-center gap-2 rounded-lg px-3 py-[6px] hover:bg-state-base-hover ')}
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center radius-sm border-[0.5px] border-divider-regular bg-background-default">
                  <RiAddLine className="h-4 w-4 text-text-primary" />
                </div>
                <div className="grow text-left text-[14px] font-normal text-text-secondary">{createText}</div>
              </div>
            </MenuItem>
          </MenuItems>
        </>
      )}
    </Menu>
  )
}

export default NavSelector
