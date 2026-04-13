import { useCallback } from 'react'
import { useClipboard } from '@/hooks/use-clipboard'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface CopyIconProps {
  content: string
}

const CopyIcon: React.FC<CopyIconProps> = ({ content }) => {
  const { copied, copy, reset } = useClipboard()

  const onCopy = useCallback(() => {
    copy(content)
  }, [copy, content])

  const tooltipText = copied
    ? 'Copied'
    : 'Copy'

  const safeTooltipText = tooltipText || ''

  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <div onMouseLeave={reset}>
            {
              copied
                ? <span
                  className="i-custom-vender-line-files-copy-check mx-1 h-3.5 w-3.5 text-text-tertiary"
                  data-testid="copied-icon"
                />
                : <span
                  className="i-custom-vender-line-files-copy mx-1 h-3.5 w-3.5 cursor-pointer text-text-tertiary"
                  onClick={onCopy}
                  data-testid="copy-icon"
                />
            }
          </div>
        )}
      />
      <TooltipContent>{safeTooltipText}</TooltipContent>
    </Tooltip>
  )
}

export default CopyIcon
