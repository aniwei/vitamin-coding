import clsx from 'clsx'
import Button from '@/components/button'
import { AlertDialog as BaseAlertDialog } from '@base-ui/react/alert-dialog'
import * as React from 'react'
import type { ButtonProps } from '@/components/button'

export const AlertDialog = BaseAlertDialog.Root
export const AlertDialogTrigger = BaseAlertDialog.Trigger
export const AlertDialogTitle = BaseAlertDialog.Title
export const AlertDialogDescription = BaseAlertDialog.Description
export const AlertDialogClose = BaseAlertDialog.Close
export const AlertDialogPortal = BaseAlertDialog.Portal
export const AlertDialogBackdrop = BaseAlertDialog.Backdrop
export const AlertDialogPopup = BaseAlertDialog.Popup

interface AlertContentProps {
  children: React.ReactNode
  className?: string
  overlayClassName?: string
  popupProps?: Omit<React.ComponentPropsWithoutRef<typeof AlertDialogPopup>, 'children' | 'className'>
  backdropProps?: Omit<React.ComponentPropsWithoutRef<typeof AlertDialogBackdrop>, 'className'>
}

export const AlertContent: React.FC<AlertContentProps> = ({
  children,
  className,
  overlayClassName,
  popupProps,
  backdropProps,
}) => {
  return (
    <AlertDialogPortal>
      <AlertDialogBackdrop
        {...backdropProps}
        className={clsx(
          'inset-0 fixed z-1002 bg-background-overlay',
          'transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none',
          overlayClassName,
        )}
      />
      <AlertDialogPopup
        {...popupProps}
        className={clsx(
          'fixed top-1/2 left-1/2 z-1002 max-h-[calc(100vh-2rem)] w-[480px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-2xl border-[0.5px] border-components-panel-border bg-components-panel-bg shadow-lg',
          'transition-[transform,scale,opacity] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none',
          className,
        )}
      >
        {children}
      </AlertDialogPopup>
    </AlertDialogPortal>
  )
}

interface AlertActionsProps extends React.ComponentPropsWithoutRef<'div'> {}

export const AlertActions: React.FC<AlertActionsProps> = ({ 
  className, 
  ...props 
}) => {
  return (
    <div
      className={clsx('flex items-start justify-end gap-2 self-stretch p-6', className)}
      {...props}
    />
  )
}

interface AlertCancelButtonProps extends Omit<ButtonProps, 'children'> {
  children: React.ReactNode
  closeProps?: Omit<React.ComponentPropsWithoutRef<typeof AlertDialogClose>, 'children' | 'render'>
}

export const AlertCancelButton: React.FC<AlertCancelButtonProps> = ({
  children,
  closeProps,
  ...buttonProps
}) => {
  return (
    <AlertDialogClose
      {...closeProps}
      render={<Button {...buttonProps} />}
    >
      {children}
    </AlertDialogClose>
  )
}

interface AlertConfirmButtonProps extends ButtonProps {}

export const AlertConfirmButton: React.FC<AlertConfirmButtonProps> = ({
  variant = 'primary',
  destructive = true,
  ...props
}) => {
  return (
    <Button
      variant={variant}
      destructive={destructive}
      {...props}
    />
  )
}

export default {
  AlertTrigger: AlertDialogTrigger,
  AlertTitle: AlertDialogTitle,
  AlertDescription: AlertDialogDescription,
  AlertClose: AlertDialogClose,
  AlertContent,
  AlertActions,
  AlertCancelButton,
  AlertConfirmButton,
}