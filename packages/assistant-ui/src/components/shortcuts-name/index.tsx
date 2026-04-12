import { memo } from 'react'
import { clsx } from 'clsx'
import { getKeyboardKeyNameBySystem } from '@/shared/keyboard'

interface ShortcutsNameProps {
  keys: string[]
  className?: string
  textColor?: 'default' | 'secondary'
  backgroundColor?: 'gray' | 'white'
}

export const ShortcutsName: React.FC<ShortcutsNameProps> = memo(({
  keys,
  className,
  textColor = 'default',
  backgroundColor = 'gray',
}) => {
  return (
    <div className={clsx('flex items-center gap-0.5', className)}>
      {
        keys.map(key => (
          <div
            key={key}
            className={clsx(
              'system-kbd flex h-4 min-w-4 items-center justify-center radius-xs px-1 capitalize',
              backgroundColor === 'gray' && 'bg-components-kbd-bg-gray',
              backgroundColor === 'white' && 'bg-components-kbd-bg-white text-text-primary-on-surface',
              textColor === 'secondary' && 'text-text-tertiary',
            )}
          >{getKeyboardKeyNameBySystem(key)}</div>
        ))
      }
    </div>
  )
})

export default ShortcutsName
