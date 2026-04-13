import clsx from 'clsx'
import Button from '@/components/button'
import { memo } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { ButtonProps } from '@/components/button'

interface ModalProps {
  size?: 'sm' | 'md'
  title: string
  subTitle?: string
  children?: React.ReactNode
  confirmButtonText?: string
  cancelButtonText?: string
  showExtraButton?: boolean
  extraButtonText?: string
  extraButtonVariant?: ButtonProps['variant']
  footerSlot?: React.ReactNode
  bottomSlot?: React.ReactNode
  disabled?: boolean
  containerClassName?: string
  wrapperClassName?: string
  clickOutsideNotClose?: boolean
  onClose?: () => void
  onConfirm?: () => void
  onCancel?: () => void
  onExtraButtonClick?: () => void
}

export const Modal: React.FC<ModalProps> = ({
  size = 'sm',
  title,
  subTitle,
  children,
  confirmButtonText,
  cancelButtonText,
  showExtraButton,
  extraButtonVariant = 'warning',
  extraButtonText,
  footerSlot,
  bottomSlot,
  disabled,
  containerClassName,
  wrapperClassName,
  clickOutsideNotClose = false,
  onClose,
  onConfirm,
  onCancel,
  onExtraButtonClick,
}) => {
  const handleOpenChange = (open: boolean) => {
    if (!open && !clickOutsideNotClose) {
      onClose?.()
    }
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        overlayClassName={clsx('!z-9998', wrapperClassName)}
        className={clsx(
          '!z-9998 !flex !max-h-[80%] !flex-col !overflow-hidden !p-0 !shadow-xs',
          size === 'sm' && '!w-[480px]',
          size === 'md' && '!w-[640px]',
          containerClassName
        )}
        backdropProps={{ forceRender: true }}
      >
        <div className="relative shrink-0 p-6 pb-3 pr-14 text-text-primary title-2xl-semi-bold">
          {title}
          {
            subTitle && <div className="mt-1 text-text-tertiary system-xs-regular">
              {subTitle}
            </div>
          }
          <div
            className="absolute right-5 top-5 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg"
            onClick={onClose}
          >
            <span className="i-ri-close-line h-5 w-5 text-text-tertiary" data-testid="close-icon" />
          </div>
        </div>
        {
          !!children && <div 
            className="min-h-0 flex-1 overflow-y-auto px-6 py-3"
          >{children}</div>
        }
        <div className="flex shrink-0 justify-between p-6 pt-5">
          <div>{footerSlot}</div>
          <div className="flex items-center">
            {
              showExtraButton && <>
                <Button
                  variant={extraButtonVariant}
                  onClick={onExtraButtonClick}
                  disabled={disabled}
                >{extraButtonText || 'Remove'}</Button>
                <div className="mx-3 h-4 w-px bg-divider-regular"></div>
              </>
            }
            <Button
              onClick={onCancel}
              disabled={disabled}
            >{cancelButtonText || 'Cancel'}</Button>
            <Button
              className="ml-2"
              variant="primary"
              onClick={onConfirm}
              disabled={disabled}
            >{confirmButtonText || 'Save'}</Button>
          </div>
        </div>
        {
          !!bottomSlot && <div className="shrink-0">
            {bottomSlot}
          </div>
        }
      </DialogContent>
    </Dialog>
  )
}

Modal.displayName = 'Modal'

export default memo(Modal)
