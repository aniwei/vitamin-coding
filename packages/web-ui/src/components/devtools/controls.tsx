'use client'

import { memo, useCallback, useState } from 'react'

import { Separator } from '@/components/ui/separator'

import { UINode } from 'lib/ai/workflow/workflow.interface'

import { Loader, PlayIcon, AlignHorizontalSpaceAround, TerminalIcon, CircleDot } from 'lucide-react'
import { Button } from 'ui/button'
import { BreakpointDialog } from './breakpoint-dialog'
import { useBreakpointStore } from '@/app/store/breakpoint.store'

import equal from 'lib/equal'

import { Avatar, AvatarFallback, AvatarImage } from 'ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from 'ui/tooltip'
import { ShareableActions } from '@/components/shareable-actions'

import { DBWorkflow } from 'app-types/workflow'

import { SelectedNodeConfigTab } from './selected-node-config-tab'
import { ExecuteTab } from './node-config/execute-tab'
import { useReactFlow } from '@xyflow/react'
import { safe } from 'ts-safe'
import { handleErrorWithToast } from 'ui/shared-toast'
import { mutate } from 'swr'
import { allNodeValidate } from 'lib/ai/workflow/node-validate'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { arrangeNodes } from 'lib/ai/workflow/arrange-nodes'
import { EditWorkflow } from './edit-workflow'

export const Controls = memo(
  function Controls({
    selectedNode,
    isProcessing,
    onSave,
    workflow,
    addProcess,
    hasEditAccess,
    onToggleConsole,
    showConsole,
  }: {
    selectedNode?: UINode
    onSave: () => Promise<void>
    isProcessing: boolean
    workflow: DBWorkflow
    addProcess: () => () => void
    hasEditAccess?: boolean
    onToggleConsole?: () => void
    showConsole?: boolean
  }) {
    const { setNodes, getNodes, getEdges } = useReactFlow()
    const [showExecutePanel, setShowExecutePanel] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [showBreakpoints, setShowBreakpoints] = useState(false)
    const breakpointEnabledCount = useBreakpointStore((s) => s.breakpoints.filter((b) => b.enabled).length)
    const t = useTranslations()

    const handleArrangeNodes = useCallback(() => {
      const nodes = getNodes() as UINode[]
      const edges = getEdges()

      const { nodes: arrangedNodes } = arrangeNodes(nodes, edges)

      setNodes(arrangedNodes)
      toast.success(t('Workflow.nodesArranged'))
    }, [getNodes, getEdges, setNodes, t])
    const updateVisibility = useCallback(
      (visibility: DBWorkflow['visibility']) => {
        setIsSaving(true)
        const close = addProcess()
        safe(() =>
          fetch(`/api/workflow/${workflow.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              visibility,
            }),
          }).then((res) => {
            if (res.status != 200) throw new Error(res.statusText)
          })
        )
          .ifOk(() => mutate(`/api/workflow/${workflow.id}`))
          .ifFail((e) => handleErrorWithToast(e))
          .watch(() => {
            setIsSaving(false)
            close()
          })
      },
      [workflow]
    )

    const updatePublished = useCallback(
      (isPublished: boolean) => {
        if (isPublished) {
          const validateResult = allNodeValidate({
            nodes: getNodes() as UINode[],
            edges: getEdges(),
          })

          if (validateResult !== true) {
            if (validateResult.node) {
              setNodes((nds) => {
                return nds.map((node) => {
                  if (node.id === validateResult.node?.id) {
                    return { ...node, selected: true }
                  }
                  if (node.selected) {
                    return { ...node, selected: false }
                  }
                  return node
                })
              })
            }
            return toast.warning(validateResult.errorMessage)
          }
        }

        const close = addProcess()
        safe(() => onSave())
          .ifOk(() =>
            fetch(`/api/workflow/${workflow.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                isPublished,
              }),
            }).then((res) => {
              if (res.status != 200) throw new Error(res.statusText)
            })
          )
          .ifOk(() => mutate(`/api/workflow/${workflow.id}`))
          .ifFail((e) => handleErrorWithToast(e))
          .watch(close)
      },
      [workflow]
    )

    const handleWorkflowMasterSave = useCallback((workflow: DBWorkflow) => {
      mutate(`/api/workflow/${workflow.id}`)
      setIsEditing(false)
    }, [])

    return (
      <div className="min-h-0 flex flex-col items-end">
        <div className="flex items-center gap-2 mb-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                disabled={isProcessing || !hasEditAccess}
                onClick={handleArrangeNodes}
              >
                <AlignHorizontalSpaceAround className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{t('Workflow.arrangeNodes')}</p>
            </TooltipContent>
          </Tooltip>
          <div className="h-6">
            <Separator orientation="vertical" />
          </div>
          <Button
            variant="secondary"
            disabled={isProcessing}
            onClick={() => {
              setNodes((nds) => {
                return nds.map((node) => {
                  if (node.selected) {
                    return { ...node, selected: false }
                  }
                  return node
                })
              })
              setShowExecutePanel(!showExecutePanel)
            }}
          >
            <PlayIcon />
            {t('Common.run')}
          </Button>
          <div className="h-6">
            <Separator orientation="vertical" />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => onToggleConsole?.()}
              >
                <TerminalIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Console</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="relative"
                onClick={() => setShowBreakpoints(true)}
              >
                <CircleDot className="size-4" />
                {breakpointEnabledCount > 0 && (
                  <span className="absolute -top-1 -right-1 size-3.5 rounded-full bg-amber-500 text-[9px] text-white flex items-center justify-center font-bold tabular-nums leading-none">
                    {breakpointEnabledCount > 9 ? '9+' : breakpointEnabledCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">断点</TooltipContent>
          </Tooltip>

          
          <div className="h-6">
            <Separator orientation="vertical" />
          </div>
        
        </div>
        <div className="flex gap-2">
          {selectedNode && <SelectedNodeConfigTab node={selectedNode} consoleOpen={showConsole} />}
          {showExecutePanel && (
            <ExecuteTab
              close={() => {
                if (isProcessing) return
                setShowExecutePanel(false)
              }}
              onSave={onSave}
              consoleOpen={showConsole}
            />
          )}
        </div>
        <EditWorkflow
          open={isEditing}
          onOpenChange={setIsEditing}
          defaultValue={workflow}
          onSave={handleWorkflowMasterSave}
        />
        <BreakpointDialog
          open={showBreakpoints}
          onOpenChange={setShowBreakpoints}
        />
      </div>
    )
  },
  (prev, next) => {
    if (prev.isProcessing !== next.isProcessing) {
      return false
    }
    if (Boolean(prev.selectedNode) !== Boolean(next.selectedNode)) {
      return false
    }
    if (prev.hasEditAccess !== next.hasEditAccess) {
      return false
    }
    if (!equal(prev.selectedNode?.data, next.selectedNode?.data)) {
      return false
    }

    if (!equal(prev.workflow, next.workflow)) return false
    return true
  }
)
