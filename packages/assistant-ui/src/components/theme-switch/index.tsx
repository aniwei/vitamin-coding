import { useTheme } from 'next-themes'
import { clsx } from 'clsx'

type Theme = 'light' | 'dark' | 'system'

const ThemeSwitcher = () => {
  const { theme, setTheme } = useTheme()

  const onThemeChange = (newTheme: Theme) => {
    setTheme(newTheme)
  }

  return (
    <div className="flex items-center radius-lg bg-components-segmented-control-bg-normal p-0.5">
      <button
        type="button"
        className={clsx(
          'rounded-lg px-2 py-1 text-text-tertiary hover:bg-state-base-hover hover:text-text-secondary',
          theme === 'system' && 'bg-components-segmented-control-item-active-bg text-text-accent-light-mode-only shadow-sm hover:bg-components-segmented-control-item-active-bg hover:text-text-accent-light-mode-only',
        )}
        onClick={() => onThemeChange('system')}
        aria-label="System theme"
        data-testid="system-theme-container"
      >
        <div className="p-0.5">
          <span className="i-ri-computer-line h-4 w-4" />
        </div>
      </button>
      <div className={clsx('h-[14px] w-px bg-transparent', theme === 'dark' && 'bg-divider-regular')} data-testid="divider"></div>
      <button
        type="button"
        className={clsx(
          'rounded-lg px-2 py-1 text-text-tertiary hover:bg-state-base-hover hover:text-text-secondary',
          theme === 'light' && 'bg-components-segmented-control-item-active-bg text-text-accent-light-mode-only shadow-sm hover:bg-components-segmented-control-item-active-bg hover:text-text-accent-light-mode-only',
        )}
        onClick={() => onThemeChange('light')}
        aria-label="Light theme"
        data-testid="light-theme-container"
      >
        <div className="p-0.5">
          <span className="i-ri-sun-line h-4 w-4" />
        </div>
      </button>
      <div className={clsx('h-[14px] w-px bg-transparent', theme === 'system' && 'bg-divider-regular')} data-testid="divider"></div>
      <button
        type="button"
        className={clsx(
          'rounded-lg px-2 py-1 text-text-tertiary hover:bg-state-base-hover hover:text-text-secondary',
          theme === 'dark' && 'bg-components-segmented-control-item-active-bg text-text-accent-light-mode-only shadow-sm hover:bg-components-segmented-control-item-active-bg hover:text-text-accent-light-mode-only',
        )}
        onClick={() => onThemeChange('dark')}
        aria-label="Dark theme"
        data-testid="dark-theme-container"
      >
        <div className="p-0.5">
          <span className="i-ri-moon-line h-4 w-4" />
        </div>
      </button>
    </div>
  )
}

export default ThemeSwitcher