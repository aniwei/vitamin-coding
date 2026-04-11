import { memo } from 'react'
import {
  getBezierPath,
  Position,
} from 'reactflow'
import type { ConnectionLineComponentProps } from 'reactflow'


const CustomConnectionLine: React.FC<ConnectionLineComponentProps> = memo(({ fromX, fromY, toX, toY }) => {
  const [
    edgePath,
  ] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: Position.Right,
    targetX: toX,
    targetY: toY,
    targetPosition: Position.Left,
    curvature: 0.16,
  })

  return (
    <g>
      <path
        fill="none"
        stroke="#D0D5DD"
        strokeWidth={2}
        d={edgePath}
      />
      <rect
        x={toX}
        y={toY - 4}
        width={2}
        height={8}
        fill="#2970FF"
      />
    </g>
  )
})

export default CustomConnectionLine
