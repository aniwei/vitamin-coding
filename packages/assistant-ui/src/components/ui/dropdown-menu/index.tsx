import clsx from 'clsx'
import { Menu } from '@base-ui/react/menu'
import { parsePlacement } from '@/components/placement'
import {
  menuGroupLabelClassName,
  menuIndicatorClassName,
  menuPopupAnimationClassName,
  menuPopupBaseClassName,
  menuRowClassName,
  menuSeparatorClassName,
} from '@/components/menu-shared'
import * as React from 'react'
import type { Placement } from '@/components/placement'

export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger
export const DropdownMenuSub = Menu.SubmenuRoot
export const DropdownMenuGroup = Menu.Group
export const DropdownMenuRadioGroup = Menu.RadioGroup

export function DropdownMenuRadioItem({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem
      className={clsx(menuRowClassName, className)}
      {...props}
    />
  )
}

export function DropdownMenuRadioItemIndicator({
  className,
  ...props
}: Omit<React.ComponentPropsWithoutRef<typeof Menu.RadioItemIndicator>, 'children'>) {
  return (
    <Menu.RadioItemIndicator
      className={clsx(menuIndicatorClassName, className)}
      {...props}
    >
      <span aria-hidden className="i-ri-check-line h-4 w-4" />
    </Menu.RadioItemIndicator>
  )
}

export function DropdownMenuCheckboxItem({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem
      className={clsx(menuRowClassName, className)}
      {...props}
    />
  )
}

export function DropdownMenuCheckboxItemIndicator({
  className,
  ...props
}: Omit<React.ComponentPropsWithoutRef<typeof Menu.CheckboxItemIndicator>, 'children'>) {
  return (
    <Menu.CheckboxItemIndicator
      className={clsx(menuIndicatorClassName, className)}
      {...props}
    >
      <span aria-hidden className="i-ri-check-line h-4 w-4" />
    </Menu.CheckboxItemIndicator>
  )
}

export function DropdownMenuGroupLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.GroupLabel>) {
  return (
    <Menu.GroupLabel
      className={clsx(menuGroupLabelClassName, className)}
      {...props}
    />
  )
}

type DropdownMenuContentProps = {
  children: React.ReactNode
  placement?: Placement
  sideOffset?: number
  alignOffset?: number
  className?: string
  popupClassName?: string
  positionerProps?: Omit<
    React.ComponentPropsWithoutRef<typeof Menu.Positioner>,
    'children' | 'className' | 'side' | 'align' | 'sideOffset' | 'alignOffset'
  >
  popupProps?: Omit<
    React.ComponentPropsWithoutRef<typeof Menu.Popup>,
    'children' | 'className'
  >
}

type DropdownMenuPopupRenderProps = Required<Pick<DropdownMenuContentProps, 'children'>> & {
  placement: Placement
  sideOffset: number
  alignOffset: number
  className?: string
  popupClassName?: string
  positionerProps?: DropdownMenuContentProps['positionerProps']
  popupProps?: DropdownMenuContentProps['popupProps']
}

function renderDropdownMenuPopup({
  children,
  placement,
  sideOffset,
  alignOffset,
  className,
  popupClassName,
  positionerProps,
  popupProps,
}: DropdownMenuPopupRenderProps) {
  const { side, align } = parsePlacement(placement)

  return (
    <Menu.Portal>
      <Menu.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className={clsx('z-1002 outline-hidden', className)}
        {...positionerProps}
      >
        <Menu.Popup
          className={clsx(
            menuPopupBaseClassName,
            menuPopupAnimationClassName,
            popupClassName,
          )}
          {...popupProps}
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  )
}

export function DropdownMenuContent({
  children,
  placement = 'bottom-end',
  sideOffset = 4,
  alignOffset = 0,
  className,
  popupClassName,
  positionerProps,
  popupProps,
}: DropdownMenuContentProps) {
  return renderDropdownMenuPopup({
    children,
    placement,
    sideOffset,
    alignOffset,
    className,
    popupClassName,
    positionerProps,
    popupProps,
  })
}

type DropdownMenuSubTriggerProps = React.ComponentPropsWithoutRef<typeof Menu.SubmenuTrigger> & {
  destructive?: boolean
}

export function DropdownMenuSubTrigger({
  className,
  destructive,
  children,
  ...props
}: DropdownMenuSubTriggerProps) {
  return (
    <Menu.SubmenuTrigger
      className={clsx(menuRowClassName, destructive && 'text-text-destructive', className)}
      {...props}
    >
      {children}
      <span aria-hidden className="ml-auto i-ri-arrow-right-s-line size-4 shrink-0 text-text-tertiary" />
    </Menu.SubmenuTrigger>
  )
}

type DropdownMenuSubContentProps = {
  children: React.ReactNode
  placement?: Placement
  sideOffset?: number
  alignOffset?: number
  className?: string
  popupClassName?: string
  positionerProps?: DropdownMenuContentProps['positionerProps']
  popupProps?: DropdownMenuContentProps['popupProps']
}

export function DropdownMenuSubContent({
  children,
  placement = 'left-start',
  sideOffset = 4,
  alignOffset = 0,
  className,
  popupClassName,
  positionerProps,
  popupProps,
}: DropdownMenuSubContentProps) {
  return renderDropdownMenuPopup({
    children,
    placement,
    sideOffset,
    alignOffset,
    className,
    popupClassName,
    positionerProps,
    popupProps,
  })
}

type DropdownMenuItemProps = React.ComponentPropsWithoutRef<typeof Menu.Item> & {
  destructive?: boolean
}

export function DropdownMenuItem({
  className,
  destructive,
  ...props
}: DropdownMenuItemProps) {
  return (
    <Menu.Item
      className={clsx(menuRowClassName, destructive && 'text-text-destructive', className)}
      {...props}
    />
  )
}

type DropdownMenuLinkItemProps = React.ComponentPropsWithoutRef<typeof Menu.LinkItem> & {
  destructive?: boolean
}

export function DropdownMenuLinkItem({
  className,
  destructive,
  closeOnClick = true,
  ...props
}: DropdownMenuLinkItemProps) {
  return (
    <Menu.LinkItem
      className={clsx(menuRowClassName, destructive && 'text-text-destructive', className)}
      closeOnClick={closeOnClick}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.Separator>) {
  return (
    <Menu.Separator
      className={clsx(menuSeparatorClassName, className)}
      {...props}
    />
  )
}
