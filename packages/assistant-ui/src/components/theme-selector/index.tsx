import { useTheme } from 'next-themes'
import { useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export type Theme = 'light' | 'dark' | 'system'

export default function ThemeSelector() {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme)
    setOpen(false)
  }

  const getCurrentIcon = () => {
    switch (theme) {
      case 'light': return <span className="i-ri-sun-line h-4 w-4 text-text-tertiary" />
      case 'dark': return <span className="i-ri-moon-line h-4 w-4 text-text-tertiary" />
      default: return <span className="i-ri-computer-line h-4 w-4 text-text-tertiary" />
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger
        render={(
          <button
            type="button"
            className={`h-8 w-8 rounded-lg p-[6px] ${open ? 'bg-state-base-hover' : 'hover:bg-state-base-hover'}`}
            aria-label="Theme"
          >
            {getCurrentIcon()}
          </button>
        )}
      >
      </PopoverTrigger>
      <PopoverContent
        placement="bottom-end"
        sideOffset={6}
        className="z-1000"
        popupClassName="border-none bg-transparent p-0 shadow-none"
      >
        <div className="flex w-[144px] flex-col items-start rounded-xl border-[0.5px] border-components-panel-border bg-components-panel-bg-blur p-1 shadow-lg">
          <button
            type="button"
            className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-text-secondary hover:bg-state-base-hover"
            onClick={() => handleThemeChange('light')}
          >
            <span className="i-ri-sun-line h-4 w-4 text-text-tertiary" />
            <div className="flex grow items-center justify-start px-1">
              <span className="system-md-regular">Light</span>
            </div>
            {
              theme === 'light' && <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                <span className="i-ri-check-line h-4 w-4 text-text-accent" data-testid="light-icon" />
              </div>
            }
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-text-secondary hover:bg-state-base-hover"
            onClick={() => handleThemeChange('dark')}
          >
            <span className="i-ri-moon-line h-4 w-4 text-text-tertiary" />
            <div className="flex grow items-center justify-start px-1">
              <span className="system-md-regular">Dark</span>
            </div>
            {
              theme === 'dark' && <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                <span className="i-ri-check-line h-4 w-4 text-text-accent" data-testid="dark-icon" />
              </div>
            }
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-text-secondary hover:bg-state-base-hover"
            onClick={() => handleThemeChange('system')}
          >
            <span className="i-ri-computer-line h-4 w-4 text-text-tertiary" />
            <div className="flex grow items-center justify-start px-1">
              <span className="system-md-regular">Auto</span>
            </div>
            {
              theme === 'system' && <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                <span className="i-ri-check-line h-4 w-4 text-text-accent" data-testid="system-icon" />
              </div>
            }
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
