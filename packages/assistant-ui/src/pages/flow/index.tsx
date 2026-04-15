import { memo, useCallback } from 'react'
import ReactFlow, {
  Background,
  ReactFlowProvider,
  SelectionMode,
} from 'reactflow'
import CustomEdge from '@/components/workflow/custom-edge'
import CustomNode from '@/components/workflow/nodes'
import IterationStartNode from '@/components/workflow/nodes/iteration-start'
import LoopStartNode from '@/components/workflow/nodes/loop-start'
import CustomNoteNode from '@/components/workflow/note-node'
import CustomConnectionLine from '@/components/workflow/custom-connection-line'
import Panel from '@/components/panel'
import Operator from '@/components/workflow/operator'
import Layout from './layout'
import { ChatBox } from '@/components/workflow/chat-box'
import { Header } from '@/components/workflow/header'

import { clsx } from 'clsx'
import { 
  ITERATION_CHILDREN_Z_INDEX,
  CUSTOM_ITERATION_START_NODE,
  CUSTOM_LOOP_START_NODE,
  CUSTOM_NOTE_NODE,
  CUSTOM_SIMPLE_NODE,
  CUSTOM_EDGE,
  CUSTOM_NODE,
} from './constants'

import type {
  EdgeChange,
  NodeChange,
  Viewport,
} from 'reactflow'

import type { Edge, Node,} from '@/components/workflow/types'

import 'reactflow/dist/style.css'
import './index.module.css'

const nodeTypes = {
  [CUSTOM_NODE]: CustomNode,
  [CUSTOM_NOTE_NODE]: CustomNoteNode,
  [CUSTOM_SIMPLE_NODE]: CustomNode,
  [CUSTOM_ITERATION_START_NODE]: IterationStartNode,
  [CUSTOM_LOOP_START_NODE]: LoopStartNode,
}
const edgeTypes = {
  [CUSTOM_EDGE]: CustomEdge,
}

interface WorkflowPreviewProps {
  nodes: Node[]
  edges: Edge[]
  viewport: Viewport
  className?: string
  miniMapToRight?: boolean
}

const WorkflowMain: React.FC<WorkflowPreviewProps> = memo(({
  nodes,
  edges,
  viewport,
  className,
  miniMapToRight,
}) => {
  const onNodesChange = useCallback((changes: NodeChange[]) => {}, [])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {}, [])
  
  return (
    <Layout sessionId="your-session-id">
      <div className="flex row h-full w-full">
        <ChatBox chatList={[]} />
      
        <div
          id="workflow-container"
          className={clsx('relative h-full w-full', className)}
        >
          <Header />
          <ReactFlow
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodes={nodes}
            onNodesChange={onNodesChange}
            edges={edges}
            onEdgesChange={onEdgesChange}
            connectionLineComponent={CustomConnectionLine}
            connectionLineContainerStyle={{ zIndex: ITERATION_CHILDREN_Z_INDEX }}
            defaultViewport={viewport}
            multiSelectionKeyCode={null}
            deleteKeyCode={null}
            nodesDraggable
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            panOnScroll={false}
            selectionKeyCode={null}
            selectionMode={SelectionMode.Partial}
            minZoom={0.25}
          >
            <Background
              gap={[14, 14]}
              size={2}
              className="bg-workflow-canvas-workflow-bg"
              color="var(--color-workflow-canvas-workflow-dot-color)"
            />
          </ReactFlow>
          
          <Panel />
          <Operator />
        </div>
      </div>
    </Layout>
  )
})

const Workflow: React.FC<WorkflowPreviewProps> = (props) => {
  return <ReactFlowProvider>
    <WorkflowMain {...props} />
  </ReactFlowProvider>
  
}

export default Workflow
