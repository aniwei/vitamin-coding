import { memo, useCallback } from 'react'
import {
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from 'reactflow'
import CustomEdge from '@/components/workflow/custom-edge'
import CustomNode from '@/components/workflow/nodes'
import IterationStartNode from '@/components/workflow/nodes/iteration-start'
import LoopStartNode from '@/components/workflow/nodes/loop-start'
import CustomNoteNode from '@/components/workflow/note-node'
import Workflow from '@/components/workflow'
import Layout from './layout'
import { ChatBox } from '@/components/workflow/chat-box'

import { clsx } from 'clsx'
import { 
  CustomNodeType
} from '@/components/workflow/types'

import type {
  EdgeChange,
  NodeChange,
  Viewport,
} from 'reactflow'

import { useAppContext } from '@/context/app-context'
import type { Edge, Node,} from '@/components/workflow/types'

import 'reactflow/dist/style.css'
import './index.module.css'

const nodeTypes = {
  [CustomNodeType.CustomNode]: CustomNode,
  [CustomNodeType.CustomNoteNode]: CustomNoteNode,
  [CustomNodeType.CustomSimpleNode]: CustomNode,
  [CustomNodeType.CustomIterationStartNode]: IterationStartNode,
  [CustomNodeType.CustomLoopStartNode]: LoopStartNode,
}

const edgeTypes = {
  [CustomNodeType.CustomEdge]: CustomEdge,
}

interface WorkflowMainProps {
  sessionId: string
}

const WorkflowMain: React.FC<WorkflowMainProps> = (props) => {
  const { sessionId } = props
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    console.log('Nodes changed:', changes)
  }, [])

  const onUpdate = useCallback((v: unknown) => {
    console.log('Workflow updated:', v)
  }, [])

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    console.log('Node clicked:', node)
  }, [])

  const isValidConnection = useCallback((connection: unknown) => {

  }, [])

  const {
    height,
    width,
    viewport,
    controlMode
  } = useAppContext()

  const [nodes, setNodes] = useNodesState([])
  const [edges, setEdges] = useEdgesState([])

  return (
    <ReactFlowProvider>
      <Layout sessionId={sessionId}>
        <ChatBox chatList={[]} />
        <Workflow 
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          height={height}
          width={width}
          viewport={viewport}
          controlMode={controlMode}
          onUpdate={onUpdate}
          onNodeClick={onNodeClick}
          isValidConnection={isValidConnection}
        >
        </Workflow>
      </Layout>
    </ReactFlowProvider>
  )
}

export default WorkflowMain
