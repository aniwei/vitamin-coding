import { useEffect } from 'react'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Edge,
  Node,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useDevtoolsStore } from '../../../stores/debug'
import { BreakpointNode } from './BreakpointNode'

const nodeTypes = {
  custom: BreakpointNode,
}

const FLOW_NODES: { id: string; label: string; point: string; x: number; y: number; isVirtual?: boolean; category: string }[] = [
  // Session Init
  { id: '1', label: 'Session Start', point: 'session_create', x: 250, y: 50, category: 'session' },
  
  // Prompt Processing
  { id: '2', label: 'Prompt Before', point: 'prompt_before', x: 250, y: 150, category: 'prompt' },
  { id: '3', label: 'Context Build', point: 'context_build', x: 250, y: 250, category: 'prompt' },
  { id: '4', label: 'Prompt After', point: 'prompt_after', x: 250, y: 350, category: 'prompt' },
  
  // Agent Loop start
  { id: '5', label: 'Loop Start', point: 'loop_start', x: 250, y: 450, category: 'loop' },
  { id: '5a', label: 'Follow Up Check', point: 'follow_up_check', x: 500, y: 450, category: 'loop' },
  { id: '5b', label: 'Steering Check', point: 'steering_check', x: 0, y: 450, category: 'loop' },
  { id: '6', label: 'Context Transform', point: 'context_transform', x: 250, y: 550, category: 'loop' },
  
  // Model Inference
  { id: '7', label: 'Model Before', point: 'model_before', x: 250, y: 650, category: 'model' },
  { id: 'inference', label: 'Model Inference', point: 'inference', isVirtual: true, x: 250, y: 750, category: 'model' },
  { id: '8', label: 'Model After', point: 'model_after', x: 250, y: 850, category: 'model' },
  
  // Tool branch
  { id: 'tool_branch', label: 'Has Tool Call?', point: 'tool_branch', isVirtual: true, x: 500, y: 850, category: 'tool' },
  { id: '9', label: 'Tool Before', point: 'tool_before', x: 750, y: 950, category: 'tool' },
  { id: '10', label: 'Tool Resolve', point: 'tool_resolve', x: 750, y: 1050, category: 'tool' },
  { id: '11', label: 'Tool Validate', point: 'tool_validate', x: 750, y: 1150, category: 'tool' },
  { id: '12', label: 'Tool Hook Before', point: 'tool_hook_before', x: 750, y: 1250, category: 'tool' },
  { id: 'tool_exec', label: 'Tool Executing', point: 'tool_exec', isVirtual: true, x: 750, y: 1350, category: 'tool' },
  { id: '13', label: 'Tool Hook After', point: 'tool_hook_after', x: 750, y: 1450, category: 'tool' },
  { id: '14', label: 'Tool After', point: 'tool_after', x: 750, y: 1550, category: 'tool' },
  
  // End loop
  { id: '15', label: 'Loop End', point: 'loop_end', x: 250, y: 1650, category: 'loop' },
  { id: '16', label: 'Messages Persist', point: 'messages_persist', x: 250, y: 1750, category: 'session' },
]

const INITIAL_EDGES: Edge[] = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3' },
  { id: 'e3-4', source: '3', target: '4' },
  { id: 'e4-5', source: '4', target: '5' },
  { id: 'e5-6', source: '5', target: '6' },
  { id: 'e5b-5', source: '5b', target: '5', type: 'step' },
  { id: 'e5a-5', source: '5a', target: '5', type: 'step' },
  { id: 'e6-7', source: '6', target: '7' },
  { id: 'e7-inf', source: '7', target: 'inference' },
  { id: 'einf-8', source: 'inference', target: '8' },
  { id: 'e8-tool', source: '8', target: 'tool_branch' },
  
  // Tool flow
  { id: 'etool-9', source: 'tool_branch', target: '9', label: 'yes', type: 'smoothstep' },
  { id: 'e9-10', source: '9', target: '10' },
  { id: 'e10-11', source: '10', target: '11' },
  { id: 'e11-12', source: '11', target: '12' },
  { id: 'e12-exec', source: '12', target: 'tool_exec' },
  { id: 'eexec-13', source: 'tool_exec', target: '13' },
  { id: 'e13-14', source: '13', target: '14' },
  
  // Tool back to loop start
  { id: 'e14-5', source: '14', target: '5', type: 'step', label: 'next loop' },
  
  // No tool flow
  { id: 'etool-15', source: 'tool_branch', target: '15', label: 'no', type: 'smoothstep' },
  { id: 'e15-16', source: '15', target: '16' },
].map(edge => ({
  ...edge,
  animated: false,
  style: { stroke: '#b1b1b7' },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 20,
    height: 20,
    color: '#b1b1b7',
  },
}))

export function BreakpointFlow({ className }: { className?: string }) {
  const { currentSnapshot, paused } = useDevtoolsStore()
  
  const initialNodes: Node[] = FLOW_NODES.map(node => ({
    id: node.id,
    position: { x: node.x, y: node.y },
    data: { label: node.label, point: node.point, isVirtual: node.isVirtual ?? false, category: node.category },
    type: 'custom',
    draggable: false,
    style: { width: 200 }
  }))

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)

  // Update edges animation
  useEffect(() => {
    if (!paused || !currentSnapshot?.point) {
      setEdges((eds) => eds.map(e => ({ ...e, animated: false, style: { stroke: '#b1b1b7' } })))
      return
    }

    const currentPoint = currentSnapshot.point
    const currentNode = FLOW_NODES.find(n => n.point === currentPoint)
    if (!currentNode) return

    setEdges((eds) => eds.map(e => {
      // Find all edges that target this node
      const isTarget = e.target === currentNode.id
      return {
        ...e,
        animated: isTarget,
        style: { stroke: isTarget ? '#f59e0b' : '#b1b1b7' } // amber-500
      }
    }))
  }, [paused, currentSnapshot, setEdges])

  return (
    <div className={`h-full flex flex-col ${className || ''}`}>
      <div className="flex-1 w-full bg-slate-50 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          fitView
          fitViewOptions={{ padding: 0.2 }}
        >
          <Background color="#ccc" gap={16} />
          <Controls />
          <MiniMap zoomable pannable />
        </ReactFlow>
      </div>
    </div>
  )
}