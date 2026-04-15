import clsx from 'clsx'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, { Background, OnEdgesChange, useEdgesState, useNodes, useNodesState, useReactFlow, type Viewport } from 'reactflow'
import { Node, Edge, ControlMode } from './types'
import { useStableHandle } from '@/hooks/use-stable-handle'
import { EventBusMessage, useEventBus } from '@/context/event-bus'
import Operator from './operator'


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
  onUpdate?: (v: unknown) => void
  onResize?: (height: number, width: number) => void
  onNodeEnter?: (event: React.MouseEvent, node: Node) => void
  onNodeLeave?: (event: React.MouseEvent, node: Node) => void
  onNodeClick?: (event: React.MouseEvent, node: Node) => void
  onNodeConnect?: (params: { source: string; target: string; sourceHandle?: string; targetHandle?: string }) => void
  onNodeConnectStart?: (params: { nodeId: string; handleType: 'source' | 'target'; handleId?: string }) => void
  onNodeConnectEnd?: (params: { nodeId: string; handleType: 'source' | 'target'; handleId?: string }) => void
  onNodeContextMenu?: (params: { nodeId: string; event: React.MouseEvent }) => void
  onEdgeEnter?: (edgeId: string) => void
  onEdgeLeave?: (edgeId: string) => void
  onEdgesChange?: (changes: OnEdgesChange[]) => void
  onEdgeContextMenu?: (params: { edgeId: string; event: React.MouseEvent }) => void 
}

const useControlHeight = (height: number, bottomPartHeight: number) => {
  return useMemo(() => {
    if (!height) {
      return '100%'
    }

    return height - bottomPartHeight
  }, [height, bottomPartHeight])
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

const useSubscription = () => {
  const { eventBus } = useEventBus()
  eventBus?.useSubscription((v: EventBusMessage) => {
    if (v.type === 'workflow-data-update') {
      // setNodes(v.payload.nodes)
      // store.getState().setNodes(v.payload.nodes)
      // setEdges(v.payload.edges)
      // workflowStore.setState({ edgeMenu: undefined })

      // if (v.payload.viewport)
      //   reactflow.setViewport(v.payload.viewport)

      // if (v.payload.hash)
      //   setSyncWorkflowDraftHash(v.payload.hash)

      // onWorkflowDataUpdate?.(v.payload)

      // setTimeout(() => setControlPromptEditorRerenderKey(Date.now()))
    }
  })
}

export const Workflow: React.FC<WorkflowProps> = memo(props => {
  const {
    nodes: initialNodes,
    edges: initialEdges,
    nodeTypes,
    edgeTypes,
    viewport,
    controlMode,
    children,
    readonly,
    onUpdate,
    onResize,
    onNodeEnter,
    onNodeLeave,
    onNodeClick,
    onNodeConnect,
    onNodeConnectStart,
    onNodeConnectEnd,
    onNodeContextMenu,
    onEdgeEnter,
    onEdgeLeave,
    onEdgesChange,
    onEdgeContextMenu,
  } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const reactflow = useReactFlow()

  const [nodes, setNodes] = useNodesState(initialNodes)
  const [edges, setEdges] = useEdgesState(initialEdges)

  const [height, setHeight] = useState(props.height)
  const [width, setWidth] = useState(props.width)
  const [bottomPartHeight, setBottomPartHeight] = useState(0)

  const showConfirm = useStore(s => s.showConfirm)
  
  const controlHeight = useControlHeight(height, bottomPartHeight)

  useResize(containerRef, (height, width) => {
    setHeight(height)
    setWidth(width)
    onResize?.(height, width)
  })

  const {
    setShowConfirm,
    setControlPromptEditorRerenderKey,
    setSyncWorkflowDraftHash,
    setNodes: setNodesInStore,
  } = workflowStore.getState()

  const currentNodes = useNodes()

  const setNodesOnlyChangeWithData = useCallback((nodes: Node[]) => {
    const nodesData = nodes.map(node => ({
      id: node.id,
      data: node.data,
    }))
    const oldData = workflowStore.getState().nodes.map(node => ({
      id: node.id,
      data: node.data,
    }))
    if (!isEqual(oldData, nodesData))
      setNodesInStore(nodes)
  }, [setNodesInStore, workflowStore])
  useEffect(() => {
    setNodesOnlyChangeWithData(currentNodes as Node[])
  }, [currentNodes, setNodesOnlyChangeWithData])
  const {
    handleSyncWorkflowDraft,
    syncWorkflowDraftWhenPageClose,
  } = useNodesSyncDraft()
  
  const store = useStoreApi()
  
  useSubscription()

  useEffect(() => {
    setAutoFreeze(false)

    return () => {
      setAutoFreeze(true)
    }
  }, [])


  useEventListener('keydown', (e) => {
    if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey))
      e.preventDefault()
    if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey))
      e.preventDefault()
    if ((e.key === 'y' || e.key === 'Y') && (e.ctrlKey || e.metaKey))
      e.preventDefault()
    if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey))
      e.preventDefault()
  })
  useEventListener('mousemove', (e) => {
    const containerClientRect = containerRef.current?.getBoundingClientRect()

    if (containerClientRect) {
      workflowStore.setState({
        mousePosition: {
          pageX: e.clientX,
          pageY: e.clientY,
          elementX: e.clientX - containerClientRect.left,
          elementY: e.clientY - containerClientRect.top,
        },
      })
    }
  })
  const {
    handlePaneContextMenu,
  } = usePanelInteractions()
  const {
    isValidConnection,
  } = useWorkflow()

  useOnViewportChange({
    onEnd: () => {
      handleSyncWorkflowDraft()
    },
  })

  useShortcuts()
  // Initialize workflow node search functionality
  useWorkflowSearch()

  // Set up scroll to node event listener using the utility function
  useEffect(() => {
    return setupScrollToNodeListener(nodes, reactflow)
  }, [nodes, reactflow])

  const { schemaTypeDefinitions } = useMatchSchemaType()
  const { fetchInspectVars } = useSetWorkflowVarsWithValue()
  const { data: buildInTools } = useAllBuiltInTools()
  const { data: customTools } = useAllCustomTools()
  const { data: workflowTools } = useAllWorkflowTools()
  const { data: mcpTools } = useAllMCPTools()
  const dataSourceList = useStore(s => s.dataSourceList)
  // buildInTools, customTools, workflowTools, mcpTools, dataSourceList
  const configsMap = useHooksStore(s => s.configsMap)
  const [isLoadedVars, setIsLoadedVars] = useState(false)
  const [vars, setVars] = useState<VarInInspect[]>([])
  useEffect(() => {
    (async () => {
      if (!configsMap?.flowType || !configsMap?.flowId)
        return
      const data = await fetchAllInspectVars(configsMap.flowType, configsMap.flowId)
      setVars(data)
      setIsLoadedVars(true)
    })()
  }, [configsMap?.flowType, configsMap?.flowId])
  useEffect(() => {
    if (schemaTypeDefinitions && isLoadedVars) {
      fetchInspectVars({
        passInVars: true,
        vars,
        passedInAllPluginInfoList: {
          buildInTools: buildInTools || [],
          customTools: customTools || [],
          workflowTools: workflowTools || [],
          mcpTools: mcpTools || [],
          dataSourceList: dataSourceList ?? [],
        },
        passedInSchemaTypeDefinitions: schemaTypeDefinitions,
      })
    }
  }, [schemaTypeDefinitions, fetchInspectVars, isLoadedVars, vars, customTools, buildInTools, workflowTools, mcpTools, dataSourceList])

  return (
    <div
      className={clsx(
        'workflow workflow-node-animation',
        'relative h-full w-full min-w-[960px]',
        readonly && 'workflow-panel-animation',
      )}
      ref={containerRef}
    >
      <div
        className="pointer-events-none absolute left-0 top-0 z-10 flex w-12 items-center justify-center p-1 pl-2"
        style={{ height: controlHeight }}
      >
        <Control />
      </div>
      <Operator />
      <PanelContextmenu />
      <NodeContextmenu />
      <EdgeContextmenu />
      <SelectionContextmenu />
      <HelpLine />
      {
        !!showConfirm && (
          <Confirm
            isShow
            onCancel={() => setShowConfirm(undefined)}
            onConfirm={showConfirm.onConfirm}
            title={showConfirm.title}
            content={showConfirm.desc}
          />
        )
      }
      {children}
      <ReactFlow
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodes={nodes}
        edges={edges}
        onNodeMouseEnter={onNodeEnter}
        onNodeMouseLeave={onNodeLeave}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onConnect={onNodeConnect}
        onConnectStart={onNodeConnectStart}
        onConnectEnd={onNodeConnectEnd}
        onEdgeMouseEnter={onEdgeEnter}
        onEdgeMouseLeave={onEdgeLeave}
        onEdgesChange={onEdgesChange}
        onEdgeContextMenu={onEdgeContextMenu}
        onSelectionStart={onSelectionStart}
        onSelectionChange={onSelectionChange}
        onSelectionDrag={onSelectionDrag}
        onPaneContextMenu={onPaneContextMenu}
        connectionLineComponent={CustomConnectionLine}
        
        connectionLineContainerStyle={{ zIndex: ITERATION_CHILDREN_Z_INDEX }}
        defaultViewport={viewport}
        multiSelectionKeyCode={null}
        deleteKeyCode={null}
        nodesDraggable={false}
        nodesConnectable={!nodesReadOnly}
        nodesFocusable={!nodesReadOnly}
        edgesFocusable={!nodesReadOnly}
        panOnScroll={controlMode === ControlMode.Pointer && !workflowReadOnly}
        panOnDrag={controlMode === ControlMode.Hand || [1]}
        zoomOnPinch={true}
        zoomOnScroll={true}
        zoomOnDoubleClick={true}
        isValidConnection={isValidConnection}
        selectionKeyCode={null}
        selectionMode={SelectionMode.Partial}
        selectionOnDrag={controlMode === ControlMode.Pointer && !workflowReadOnly}
        minZoom={0.25}
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