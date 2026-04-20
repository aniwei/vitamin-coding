import ActionButton from '@/components/action-button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  RiClipboardFill,
  RiClipboardLine,
} from '@remixicon/react'
import { useCallback } from 'react'
import { useClipboard } from '@/hooks/use-clipboard'

import s from './index.module.css'

type CopyFeedbackProps = {
  content: string
  className?: string
}

export const CopyFeedback: React.FC<CopyFeedbackProps> = ({ content }) => {
  const { copied, copy, reset } = useClipboard()

  const tooltipText = copied
    ? 'Copied'
    : 'Copy'
  const safeText = tooltipText || ''

  const handleCopy = useCallback(() => {
    copy(content)
  }, [copy, content])

  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <ActionButton onClick={handleCopy} onMouseLeave={reset}>
            {copied ? <RiClipboardFill className="h-4 w-4" /> : <RiClipboardLine className="h-4 w-4" />}
          </ActionButton>
        )}
      />
      <TooltipContent>{safeText}</TooltipContent>
    </Tooltip>
  )
}

export default CopyFeedback

export const CopyFeedbackNew = ({ content, className }: Pick<CopyFeedbackProps, 'className' | 'content'>) => {
  const { copied, copy, reset } = useClipboard()

  const tooltipText = copied
    ? 'Copied'
    : 'Copy'

  const safeText = tooltipText || ''

  const handleCopy = useCallback(() => {
    copy(content)
  }, [copy, content])

  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <div
            className={`h-8 w-8 cursor-pointer rounded-lg hover:bg-components-button-ghost-bg-hover ${className ?? ''}`}
            onClick={handleCopy}
            onMouseLeave={reset}
          >
            <div
              className={`h-full w-full ${s.copyIcon} ${copied ? s.copied : ''}`}
            />
          </div>
        )}
      />
      <TooltipContent>{safeText}</TooltipContent>
    </Tooltip>
  )
}
