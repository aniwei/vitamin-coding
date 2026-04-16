type NodeSelectionDetail = {
  nodeId: string
  focus?: boolean
}

export function selectWorkflowNode(nodeId: string, focus = false): void {
  const event = new CustomEvent('workflow:select-node', {
    detail: {
      nodeId,
      focus,
    },
  })
  document.dispatchEvent(event)
}

export function scrollToWorkflowNode(nodeId: string): void {
  const event = new CustomEvent('workflow:scroll-to-node', {
    detail: { nodeId },
  })
  document.dispatchEvent(event)
}

export function setupNodeSelectionListener(
  handleNodeSelect: (nodeId: string) => void,
): () => void {
  // Event handler for node selection
  const handleNodeSelection = (event: CustomEvent<NodeSelectionDetail>) => {
    const { nodeId, focus } = event.detail
    if (nodeId) {
      // Select the node
      handleNodeSelect(nodeId)

      // If focus is requested, scroll to the node
      if (focus) {
        // Use a small timeout to ensure node selection happens first
        setTimeout(() => {
          scrollToWorkflowNode(nodeId)
        }, 100)
      }
    }
  }

  // Add event listener
  document.addEventListener(
    'workflow:select-node',
    handleNodeSelection as EventListener,
  )

  // Return cleanup function
  return () => {
    document.removeEventListener(
      'workflow:select-node',
      handleNodeSelection as EventListener,
    )
  }
}

export function setupScrollToNodeListener(
  nodes: any[],
  reactflow: any,
): () => void {
  const handleScrollToNode = (event: CustomEvent<NodeSelectionDetail>) => {
    const { nodeId } = event.detail
    if (nodeId) {
      const node = nodes.find(n => n.id === nodeId)
      if (node) {
        const nodePosition = { x: node.position.x, y: node.position.y }

        const targetX = nodePosition.x + window.innerWidth * 0.25
        const targetY = nodePosition.y + window.innerHeight * 0.25

        reactflow.setCenter(targetX, targetY, { zoom: 1, duration: 800 })
      }
    }
  }

  document.addEventListener(
    'workflow:scroll-to-node',
    handleScrollToNode as EventListener,
  )

  // Return cleanup function
  return () => {
    document.removeEventListener('workflow:scroll-to-node', handleScrollToNode as EventListener)
  }
}
