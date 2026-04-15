import Button from '@/components/button'
import useTheme from '@/hooks/use-theme'
import { memo } from 'react'
import { Env as Icon } from '@/components/icons/line/others'
import { clsx } from 'clsx'

interface EnvProps {
  disabled: boolean
}

export const Env: React.FC<EnvProps> = memo(({ disabled }) => {
  const { theme } = useTheme()
 

  const handleClick = () => {
    
  }

  return (
    <Button
      className={clsx(
        'rounded-lg border border-transparent p-2',
        theme === 'dark' && 'border-black/5 bg-white/10 backdrop-blur-xs',
      )}
      variant="ghost"
      disabled={disabled}
      onClick={handleClick}
    >
      <Icon className="h-4 w-4 text-components-button-secondary-text" />
    </Button>
  )
})

export default Env
