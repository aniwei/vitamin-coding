import {
  RiBold,
  RiItalic,
  RiLink,
  RiListUnordered,
  RiStrikethrough,
} from '@remixicon/react'
import {
  memo,
  useMemo,
} from 'react'
import Tooltip from '@/components/ui/tooltip'
import { clsx } from 'clsx'
import { useStore } from '../store'
import { useCommand } from './hooks'

type CommandProps = {
  type: 'bold' | 'italic' | 'strikethrough' | 'link' | 'bullet'
}
const Command = ({
  type,
}: CommandProps) => {
  const selectedIsBold = useStore(s => s.selectedIsBold)
  const selectedIsItalic = useStore(s => s.selectedIsItalic)
  const selectedIsStrikeThrough = useStore(s => s.selectedIsStrikeThrough)
  const selectedIsLink = useStore(s => s.selectedIsLink)
  const selectedIsBullet = useStore(s => s.selectedIsBullet)
  const { handleCommand } = useCommand()

  const icon = useMemo(() => {
    switch (type) {
      case 'bold':
        return <RiBold className={clsx('h-4 w-4', selectedIsBold && 'text-primary-600')} />
      case 'italic':
        return <RiItalic className={clsx('h-4 w-4', selectedIsItalic && 'text-primary-600')} />
      case 'strikethrough':
        return <RiStrikethrough className={clsx('h-4 w-4', selectedIsStrikeThrough && 'text-primary-600')} />
      case 'link':
        return <RiLink className={clsx('h-4 w-4', selectedIsLink && 'text-primary-600')} />
      case 'bullet':
        return <RiListUnordered className={clsx('h-4 w-4', selectedIsBullet && 'text-primary-600')} />
    }
  }, [type, selectedIsBold, selectedIsItalic, selectedIsStrikeThrough, selectedIsLink, selectedIsBullet])

  const tip = useMemo(() => {
    switch (type) {
      case 'bold':
        return 'Bold'
      case 'italic':
        return 'Italic'
      case 'strikethrough':
        return 'Strikethrough'
      case 'link':
        return 'Link'
      case 'bullet':
        return 'Bullet List'
    }
  }, [type])

  return (
    <Tooltip
      popupContent={tip}
    >
      <div
        className={clsx(
          'flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-tertiary hover:bg-state-accent-active hover:text-text-accent',
          type === 'bold' && selectedIsBold && 'bg-state-accent-active',
          type === 'italic' && selectedIsItalic && 'bg-state-accent-active',
          type === 'strikethrough' && selectedIsStrikeThrough && 'bg-state-accent-active',
          type === 'link' && selectedIsLink && 'bg-state-accent-active',
          type === 'bullet' && selectedIsBullet && 'bg-state-accent-active',
        )}
        onClick={() => handleCommand(type)}
      >
        {icon}
      </div>
    </Tooltip>
  )
}

export default memo(Command)
