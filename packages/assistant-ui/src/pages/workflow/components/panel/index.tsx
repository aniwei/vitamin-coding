import type { FC, ReactNode } from 'react'
import type { Node } from '../../types'
import { debounce } from 'es-toolkit/compat'
import {
  memo,
  useCallback,
} from 'react'
import { clsx } from 'clsx'

interface PanelProps {
  children: ReactNode
  id: Node['id']
  data: Node['data']
}

export const Panel: FC<PanelProps> = memo(({
  id,
  data,
  children,
}) => {
  const reservedCanvasWidth = 400 // Reserve the minimum visible width for the canvas
  const maxNodePanelWidth = 400

  const onResize = useCallback((width: number) => {
    
  }, [])

  const debounceUpdate = debounce((width: number) => {
    
  })


  return (
    <div
      className={clsx(
        'relative mr-1 h-full',
        'absolute z-0 mr-2 w-[400px] overflow-hidden rounded-2xl border-[0.5px] border-components-panel-border shadow-lg transition-all',
      )}
      style={{
        right: '-400px',
      }}
    >
      <div
        className="absolute -left-1 top-0 flex h-full w-1 cursor-col-resize resize-x items-center justify-center"
      >
        <div className="h-10 w-0.5 rounded-xs bg-state-base-handle hover:h-full hover:bg-state-accent-solid active:h-full active:bg-state-accent-solid"></div>
      </div>
      <div
        className={clsx(
          'flex h-full flex-col rounded-2xl border-[0.5px] border-components-panel-border bg-components-panel-bg shadow-lg transition-[width] ease-linear', 
          'overflow-hidden'
        )}
        style={{
          width: `400px`,
        }}
      >
        <div className="sticky top-0 z-10 shrink-0 border-b-[0.5px] border-divider-regular bg-components-panel-bg">
          <div className="flex items-center px-4 pb-1 pt-4">
          </div>
          <div className="p-2">
            
          </div>
          
        </div>
      </div>
    </div>
  )
})

export default Panel
