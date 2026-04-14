import { Button as BaseButton } from '@/components/button'
import { clsx } from 'clsx'
import { memo, useCallback } from 'react'
import { isValidUrl } from '../shared'

interface ButtonProps {
  node: {
    children: { value: string }[]
    properties: {
      dataVariant: 'primary' | 'secondary' | 'tertiary'
      dataMessage?: string
      dataLink?: string
      dataSize?: 'small' | 'medium' | 'large'
    }
  }
  onSend?: (message: string) => void
}

export const Button: React.FC<ButtonProps> = memo(({ node, onSend }) => {
  const variant = node.properties.dataVariant
  const message = node.properties.dataMessage
  const link = node.properties.dataLink
  const size = node.properties.dataSize

  const onButtonClick = useCallback(() => {
    if (link && isValidUrl(link)) {
      window.open(link, '_blank')
      return
    }

    if (!message) {
      return
    }

    onSend?.(message)
  }, [link, message, onSend])

  return (
    <BaseButton
      variant={variant}
      size={size}
      className={clsx('h-auto! min-h-8 select-none whitespace-normal px-3!')}
      onClick={onButtonClick}
    >
      <span className="text-[13px]">
        {node.children[0]?.value || ''}
      </span>
    </BaseButton>
  )
})

Button.displayName = 'Button'

export default Button
