'use client'

import type { MouseEventHandler, ReactNode } from 'react'
import { useState } from 'react'
import { Avatar } from '@/components/avatar'
import ThemeSwitcher from '@/components/theme-switch'
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuGroup, 
  DropdownMenuItem, 
  DropdownMenuLinkItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu'
import { clsx } from 'clsx'
import { About } from '../about'
import Compliance from './compliance'
import Support from './support'
import { ExternalLinkIndicator, MenuItemContent } from './menu-item-content'
import { Link, useNavigate } from 'react-router-dom'

type MenuRouteItemProps = {
  href: string
  iconClassName: string
  label: ReactNode
  trailing?: ReactNode
}

const MenuRouteItem: React.FC<MenuRouteItemProps> = ({
  href,
  iconClassName,
  label,
  trailing,
}) => {
  return (
    <DropdownMenuLinkItem
      className="justify-between"
      render={<Link to={href} />}
    >
      <MenuItemContent 
        iconClassName={iconClassName} 
        label={label} 
        trailing={trailing} 
      />
    </DropdownMenuLinkItem>
  )
}

interface MenuExternalItemProps {
  href: string
  iconClassName: string
  label: ReactNode
  trailing?: ReactNode
}

const MenuExternalItem: React.FC<MenuExternalItemProps> = ({
  href,
  iconClassName,
  label,
  trailing,
}) => {
  return (
    <DropdownMenuLinkItem
      className="justify-between"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      <MenuItemContent iconClassName={iconClassName} label={label} trailing={trailing} />
    </DropdownMenuLinkItem>
  )
}

interface MenuActionItemProps {
  iconClassName: string
  label: ReactNode
  onClick?: MouseEventHandler<HTMLElement>
  trailing?: ReactNode
}

const MenuActionItem: React.FC<MenuActionItemProps> = ({
  iconClassName,
  label,
  onClick,
  trailing,
}) => {
  return (
    <DropdownMenuItem
      className="justify-between"
      onClick={onClick}
    >
      <MenuItemContent 
        iconClassName={iconClassName} 
        label={label} 
        trailing={trailing} 
      />
    </DropdownMenuItem>
  )
}

interface MenuSectionProps {
  children: ReactNode
}

const MenuSection: React.FC<MenuSectionProps> = ({ children }) => {
  return <DropdownMenuGroup className="py-1">{children}</DropdownMenuGroup>
}

export default function AppSelector() {
  const navigate = useNavigate()
  const [aboutVisible, setAboutVisible] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [showSetting, setShowSetting] = useState(false)
  

  return (
    <div>
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger
          aria-label="Account"
          className={clsx(
            'inline-flex items-center radius-3xl p-0.5 hover:bg-background-default-dodge', 
            isMenuOpen && 'bg-background-default-dodge'
          )}
        >
          Setting
        </DropdownMenuTrigger>
        <DropdownMenuContent
          sideOffset={6}
          popupClassName="w-60 max-w-80 bg-components-panel-bg-blur! py-0! backdrop-blur-xs"
        >
          <DropdownMenuGroup className="py-1">
            {/* <div className="mx-1 flex flex-nowrap items-center py-2 pl-3 pr-2">
              <div className="grow">
                <div className="break-all text-text-primary system-md-medium">
                  {userProfile.name}
                  {isEducationAccount && (
                    <PremiumBadge size="s" color="blue" className="ml-1 px-2!">
                      <span aria-hidden className="i-ri-graduation-cap-fill mr-1 h-3 w-3" />
                      <span className="system-2xs-medium">EDU</span>
                    </PremiumBadge>
                  )}
                </div>
                <div className="break-all text-text-tertiary system-xs-regular">{userProfile.email}</div>
              </div>
              <Avatar avatar={userProfile.avatar_url} name={userProfile.name} size="lg" />
            </div> */}
            <MenuActionItem
              iconClassName="i-ri-settings-3-line"
              label="Settings"
              onClick={() => setShowSetting(true)}
            />
          </DropdownMenuGroup>
          <DropdownMenuSeparator className="my-0! bg-divider-subtle" />
          
          <MenuSection>
            <MenuExternalItem
              href=""
              iconClassName="i-ri-book-open-line"
              label="Help Center"
              trailing={<ExternalLinkIndicator />}
            />
            {/* <Support closeDropdown={() => setIsAccountMenuOpen(false)} /> */}
            {/* {IS_CLOUD_EDITION && isCurrentWorkspaceOwner && <Compliance />} */}
          </MenuSection>
          <DropdownMenuSeparator className="my-0! bg-divider-subtle" />
          <MenuSection>
            <MenuExternalItem
              href="https://roadmap.dify.ai"
              iconClassName="i-ri-map-2-line"
              label="Roadmap"
              trailing={<ExternalLinkIndicator />}
            />
            {/* <MenuExternalItem
              href="https://github.com/langgenius/dify"
              iconClassName="i-ri-github-line"
              label="GitHub"
              trailing={(
                <div className="flex items-center gap-0.5 rounded-[5px] border border-divider-deep bg-components-badge-bg-dimm px-[5px] py-[3px]">
                  <span aria-hidden className="i-ri-star-line size-3 shrink-0 text-text-tertiary" />
                  <GithubStar className="text-text-tertiary system-2xs-medium-uppercase" />
                </div>
              )}
            /> */}
          </MenuSection>
          <DropdownMenuSeparator className="my-0! bg-divider-subtle" />
        
          <MenuSection>
            <DropdownMenuItem
              closeOnClick={false}
              className="cursor-default data-highlighted:bg-transparent"
            >
              <MenuItemContent
                iconClassName="i-ri-t-shirt-2-line"
                label="Theme"
                trailing={<ThemeSwitcher />}
              />
            </DropdownMenuItem>
          </MenuSection>
          <DropdownMenuSeparator className="my-0! bg-divider-subtle" />
          <MenuSection>
            <MenuActionItem
              iconClassName="i-ri-logout-box-r-line"
              label="Logout"
              onClick={() => {
                
              }}
            />
          </MenuSection>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* <About onCancel={() => setAboutVisible(false)}  /> */}
    </div>
  )
}
