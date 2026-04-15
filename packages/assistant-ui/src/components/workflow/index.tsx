import clsx from 'clsx'
import Operator from './operator'
import CustomConnectionLine from './custom-connection-line'
import { 
  memo, 
  useEffect, 
  useRef, 
} from 'react'
import ReactFlow, { 
  Background, 
  SelectionMode,
  type Viewport 
} from 'reactflow'
import { useStableHandle } from '@/hooks/use-stable-handle'
import { Node, Edge, ControlMode } from './types'


type WorkflowProps = {
  nodes: Node[]
  edges: Edge[]
  nodeTypes: Record<string, React.FC<any>>
  edgeTypes: Record<string, React.FC<any>>
  height: number
  width: number
  viewport?: Viewport
  controlMode?: ControlMode
  children?: React.ReactNode
  readonly?: boolean
  showConfirm?: boolean,
  onUpdate?: (v: unknown) => void
  onResize?: (height: number, width: number) => void
  onNodeEnter?: (event: React.MouseEvent, node: Node) => void
  onNodeLeave?: (event: React.MouseEvent, node: Node) => void
  onNodeClick?: (event: React.MouseEvent, node: Node) => void,
  isValidConnection?: (connection: unknown) => boolean
}

const useResize = (
  containerRef: React.RefObject<HTMLDivElement | null>,
  callback: (height: number, width: number) => void,
) => {
  const update = useStableHandle(callback)

  useEffect(() => {
    if (containerRef.current) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { inlineSize, blockSize } = entry.borderBoxSize[0]
          update(blockSize, inlineSize)
        }
      })

      observer.observe(containerRef.current)
      return () => observer.disconnect()
    }
  }, [])
}

export const Workflow: React.FC<WorkflowProps> = memo(props => {
  const {
    nodes,
    edges,
    nodeTypes,
    edgeTypes,
    viewport,
    controlMode,
    children,
    readonly,
    onResize,
    onNodeEnter,
    onNodeLeave,
    onNodeClick,
    isValidConnection
  } = props
  const containerRef = useRef<HTMLDivElement>(null)

  useResize(containerRef, (height, width) => {
    onResize?.(height, width)
  })

  return (
    <div
      className={clsx(
        'workflow workflow-node-animation',
        'relative h-full w-full min-w-[960px]',
        readonly && 'workflow-panel-animation',
      )}
      ref={containerRef}
    >
      <Operator />
      {children}
      <ReactFlow
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodes={nodes}
        edges={edges}
        onNodeMouseEnter={onNodeEnter}
        onNodeMouseLeave={onNodeLeave}
        onNodeClick={onNodeClick}
        connectionLineComponent={CustomConnectionLine}
        connectionLineContainerStyle={{ zIndex: 1002 }} // TODO
        defaultViewport={viewport}
        multiSelectionKeyCode={null}
        deleteKeyCode={null}
        nodesDraggable={false}
        nodesConnectable={!readonly}
        nodesFocusable={!readonly}
        edgesFocusable={!readonly}
        panOnScroll={controlMode === ControlMode.Pointer && !readonly}
        panOnDrag={controlMode === ControlMode.Hand || [1]}
        zoomOnPinch={true}
        zoomOnScroll={true}
        zoomOnDoubleClick={true}
        selectionKeyCode={null}
        selectionMode={SelectionMode.Partial}
        selectionOnDrag={controlMode === ControlMode.Pointer && !readonly}
        minZoom={0.25}
        isValidConnection={isValidConnection}
      >
        <Background
          gap={[14, 14]}
          size={2}
          className="bg-workflow-canvas-workflow-bg"
          color="var(--color-workflow-canvas-workflow-dot-color)"
        />
      </ReactFlow>
    </div>
  )
})