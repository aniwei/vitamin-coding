
import { memo } from 'react'
import {
  Handle,
  Position,
} from 'reactflow'
import { clsx } from 'clsx'
import { BlockEnum, type Node } from './types'

type NodeHandleProps = Pick<Node, 'id' | 'data'> & {
  handleId: string
  handleClassName?: string
}
  
export const NodeTargetHandle = memo(({
  data,
  handleId,
  handleClassName,
}: NodeHandleProps) => {
  const connected = data._connectedTargetHandleIds?.includes(handleId)

  return (
    <>
      <Handle
        id={handleId}
        type="target"
        position={Position.Left}
        className={clsx(
          'z-1 h-4! w-4! rounded-none! border-none! bg-transparent! outline-hidden!',
          'after:absolute after:left-1.5 after:top-1 after:h-2 after:w-0.5 after:bg-workflow-link-line-handle',
          'transition-all hover:scale-125',
          !connected && 'after:opacity-0',
          (
            data.type === BlockEnum.Start || 
            data.type === BlockEnum.TriggerWebhook ||
            data.type === BlockEnum.TriggerSchedule ||
            data.type === BlockEnum.TriggerPlugin
          ) && 'opacity-0',
          handleClassName,
        )}
      >
      </Handle>
    </>
  )
})

NodeTargetHandle.displayName = 'NodeTargetHandle'

export const NodeSourceHandle = memo(({
  data,
  handleId,
  handleClassName,
}: NodeHandleProps) => {
  const connected = data._connectedSourceHandleIds?.includes(handleId)

  return (
    <Handle
      id={handleId}
      type="source"
      position={Position.Right}
      className={clsx(
        'group/handle z-1 h-4! w-4! rounded-none! border-none! bg-transparent! outline-hidden!',
        'after:absolute after:right-1.5 after:top-1 after:h-2 after:w-0.5 after:bg-workflow-link-line-handle',
        'transition-all hover:scale-125',
        !connected && 'after:opacity-0',
        handleClassName,
      )}
    >
    </Handle>
  )
})

NodeSourceHandle.displayName = 'NodeSourceHandle'
