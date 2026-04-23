
import Console from '../console'
import ZoomInOut from './zoom-in-out'
import { MiniMap } from 'reactflow'
import { memo, useCallback, useRef } from 'react'
import type { Node } from 'reactflow'


export const Operator = memo(() => {
  const bottomPanelRef = useRef<HTMLDivElement>(null)
  
  const getMiniMapNodeClassName = useCallback((node: Node) => {
    return node.data?.selected
      ? 'bg-workflow-minimap-block border-components-option-card-option-selected-border'
      : 'bg-workflow-minimap-block'
  }, [])

  return (
    <div
      ref={bottomPanelRef}
      className="absolute bottom-0 left-0 right-0 z-10 px-1"
      style={{
        width: `calc(100% - ${bottomPanelRef.current?.offsetWidth ?? 0}px)`,
      }}
    >
      <div className="flex justify-between px-1 pb-2">
        <div className="relative">
          <MiniMap
            pannable
            zoomable
            style={{
              width: 102,
              height: 72,
            }}
            maskColor="var(--color-workflow-minimap-bg)"
            nodeClassName={getMiniMapNodeClassName}
            nodeStrokeWidth={3}
            className="!absolute bottom-10! z-9 m-0! h-[73px]! w-[103px]! rounded-lg! border-[0.5px]! border-divider-subtle! bg-background-default-subtle! shadow-md! shadow-shadow-shadow-5!"
          />
          <ZoomInOut />
        </div>
      </div>
      <Console />
    </div>
  )
})  

Operator.displayName = 'Operator'
export default Operator
