import { ShortcutsName } from '@/components/shortcuts-name'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { memo } from 'react'

interface TipPopupProps {
  title: string
  children: React.ReactElement
  shortcuts?: string[]
}

const TipPopup: React.FC<TipPopupProps> = memo(({
  title,
  children,
  shortcuts,
}) => {
  return (
    <TooltipProvider delay={0} closeDelay={0}>
      <Tooltip>
        <TooltipTrigger render={children} />
        <TooltipContent
          sideOffset={4}
          variant="plain"
          popupClassName="bg-transparent p-0 shadow-none"
        >
        <div className="flex items-center gap-1 rounded-lg border-[0.5px] border-components-panel-border bg-components-tooltip-bg p-1.5 shadow-lg backdrop-blur-[5px]">
          <span className="system-xs-medium text-text-secondary">{title}</span>
          { shortcuts && <ShortcutsName keys={shortcuts} /> }
        </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
})

export default TipPopup
