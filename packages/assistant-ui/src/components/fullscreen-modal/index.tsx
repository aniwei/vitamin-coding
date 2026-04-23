import { 
  Dialog, 
  DialogPanel, 
  Transition, 
  TransitionChild 
} from '@headlessui/react'
import { RiCloseLargeLine } from '@remixicon/react'
import { noop } from 'es-toolkit/function'
import { clsx } from 'clsx'

interface Modal {
  className?: string
  wrapperClassName?: string
  open: boolean
  onClose?: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  closable?: boolean
  overflowVisible?: boolean
}

export const FullScreenModal: React.FC<Modal> = ({
  className,
  wrapperClassName,
  open,
  onClose = noop,
  children,
  closable = false,
  overflowVisible = false,
}) => {
  return (
    <Transition show={open} appear>
      <Dialog as="div" className={clsx('modal-dialog', wrapperClassName)} onClose={onClose}>
        <TransitionChild>
          <div className={clsx('fixed inset-0 bg-background-overlay-backdrop backdrop-blur-[6px]', 'duration-300 ease-in data-closed:opacity-0', 'data-enter:opacity-100', 'data-leave:opacity-0')} />
        </TransitionChild>

        <div
          className="fixed inset-0 h-screen w-screen p-4"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          <div className="relative h-full w-full rounded-2xl border border-effects-highlight bg-background-default-subtle">
            <TransitionChild>
              <DialogPanel className={clsx('h-full', overflowVisible ? 'overflow-visible' : 'overflow-hidden', 'duration-100 ease-in data-closed:scale-95 data-closed:opacity-0', 'data-enter:scale-100 data-enter:opacity-100', 'data-enter:scale-95 data-leave:opacity-0', className)}>
                {
                  closable && <div
                    className="absolute right-3 top-3 z-50 flex h-9 w-9 cursor-pointer items-center justify-center radius-lg bg-components-button-tertiary-bg hover:bg-components-button-tertiary-bg-hover"
                    onClick={(e) => {
                      e.stopPropagation()
                      onClose()
                    }}
                  >
                    <RiCloseLargeLine className="h-3.5 w-3.5 text-components-button-tertiary-text" />
                  </div>
                }
                {children}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
