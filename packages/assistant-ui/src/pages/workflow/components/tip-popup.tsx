import Tooltip from '@/components/ui/tooltip'
import ShortcutsName from './shortcuts-name'
import { memo } from 'react'

interface TipPopupProps {
  title: string
  children: React.ReactNode
  shortcuts?: string[]
}

const TipPopup: React.FC<TipPopupProps> = memo(({
  title,
  children,
  shortcuts,
}) => {
  return (
    <Tooltip
      needsDelay={false}
      offset={4}
      popupClassName="p-0 bg-transparent"
      popupContent={(
        <div className="flex items-center gap-1 rounded-lg border-[0.5px] border-components-panel-border bg-components-tooltip-bg p-1.5 shadow-lg backdrop-blur-[5px]">
          <span className="system-xs-medium text-text-secondary">{title}</span>
          { shortcuts && <ShortcutsName keys={shortcuts} /> }
        </div>
      )}
    >
      {children}
    </Tooltip>
  )
})

export default TipPopup
