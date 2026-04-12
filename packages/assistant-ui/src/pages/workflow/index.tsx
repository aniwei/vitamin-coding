import { memo, useCallback } from 'react'
import ReactFlow, {
  Background,
  MiniMap,
  ReactFlowProvider,
  SelectionMode,
} from 'reactflow'
import Layout from './layout'
import CustomEdge from './components/custom-edge'
import CustomNode from './components/nodes'
import IterationStartNode from './components/nodes/iteration-start'
import LoopStartNode from './components/nodes/loop-start'
import CustomNoteNode from './components/note-node'
import ZoomInOut from './components/zoom-in-out'
import CustomConnectionLine from './components/custom-connection-line'
import {
  CUSTOM_EDGE,
  CUSTOM_NODE,
  ITERATION_CHILDREN_Z_INDEX,
} from './constants'
import { CUSTOM_ITERATION_START_NODE } from './constants'
import { CUSTOM_LOOP_START_NODE } from './constants'
import { CUSTOM_NOTE_NODE } from './constants'
import { CUSTOM_SIMPLE_NODE } from './constants'
import { clsx } from 'clsx'
import { ChatBot } from './components/chat-bot'
import { Header } from './components/header'


import type {
  EdgeChange,
  NodeChange,
  Viewport,
} from 'reactflow'

import type {
  Edge,
  Node,
} from './types'

import 'reactflow/dist/style.css'
import './index.module.css'
import Panel from './components/panel'
import Inspect from './components/inspect'



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
        <ChatBot chatList={[]} />
      
        <div
          id="workflow-container"
          className={clsx('relative h-full w-full', className)}
        >
          <>
            <Header />
            <MiniMap
              pannable
              zoomable
              style={{
                width: 102,
                height: 72,
              }}
              maskColor="var(--color-workflow-minimap-bg)"
              className={clsx('absolute! bottom-14! z-9 m-0! h-[72px]! w-[102px]! rounded-lg! border-[0.5px]! border-divider-subtle! bg-background-default-subtle! shadow-md! shadow-shadow-shadow-5!', miniMapToRight ? 'right-4!' : 'left-4!')}
            />
            <div className="absolute bottom-4 left-4 z-9 mt-1 flex items-center gap-2">
              <ZoomInOut />
            </div>
          </>
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
          <Inspect />
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
