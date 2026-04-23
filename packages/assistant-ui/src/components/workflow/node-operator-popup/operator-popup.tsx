import React, { memo, useMemo } from 'react'
import { useEdges } from 'reactflow'
import { CollectionType } from '@/app/components/tools/types'
import {
  useNodeDataUpdate,
  useNodeMetaData,
  useNodesInteractions,
  useNodesReadOnly,
  useNodesSyncDraft,
} from '@/app/components/workflow/hooks'
import ShortcutsName from '../../shortcuts-name'
import { BlockEnum } from '@/app/components/workflow/types'
import {
  canRunBySingle,
} from '@/app/components/workflow/utils'
import { useAllWorkflowTools } from '@/service/use-tools'
import { canFindTool } from '@/utils'
import ChangeBlock from './change-block'
import type { Node } from '../types'

type OperatorPopupProps = {
  id: string
  data: Node['data']
  readonly?: boolean
  showHelpLink?: boolean
  onClosePopup: () => void
  onNodeSelect: () => void
}

export const OperatorPopup: React.FC<OperatorPopupProps> = memo(({
  id,
  data,
  readonly,
  showHelpLink,
  onClosePopup,
  onNodeSelect,
}) => {
  const edges = useEdges()

  const { handleNodeDataUpdate } = useNodeDataUpdate()
  const { handleSyncWorkflowDraft } = useNodesSyncDraft()
  const edge = edges.find(edge => edge.target === id)
  const nodeMetaData = useNodeMetaData({ id, data } as Node)
  const showChangeBlock = !nodeMetaData.isTypeFixed && !nodesReadOnly
  const isChildNode = !!(data.isInIteration || data.isInLoop)

  const { data: workflowTools } = useAllWorkflowTools()
  const isWorkflowTool = data.type === BlockEnum.Tool && data.provider_type === CollectionType.workflow
  const workflowAppId = useMemo(() => {
    if (!isWorkflowTool || !workflowTools || !data.provider_id)
      return undefined
    const workflowTool = workflowTools.find(item => canFindTool(item.id, data.provider_id))
    return workflowTool?.workflow_app_id
  }, [isWorkflowTool, workflowTools, data.provider_id])

  return (
    <div className="w-[240px] rounded-lg border-[0.5px] border-components-panel-border bg-components-panel-bg shadow-xl">
      {
        (showChangeBlock || canRunBySingle(data.type, isChildNode)) && (
          <>
            <div className="p-1">
              {
                canRunBySingle(data.type, isChildNode) && (
                  <div
                    className="flex h-8 cursor-pointer items-center rounded-lg px-3 text-sm text-text-secondary hover:bg-state-base-hover"
                    onClick={() => {
                      handleNodeSelect(id)
                      handleNodeDataUpdate({ id, data: { _isSingleRun: true } })
                      handleSyncWorkflowDraft(true)
                      onClosePopup()
                    }}
                  >
                    {t('panel.runThisStep', { ns: 'workflow' })}
                  </div>
                )
              }
              {
                showChangeBlock && (
                  <ChangeBlock
                    nodeId={id}
                    nodeData={data}
                    sourceHandle={edge?.sourceHandle || 'source'}
                  />
                )
              }
            </div>
            <div className="h-px bg-divider-regular"></div>
          </>
        )
      }
      {
        !nodesReadOnly && (
          <>
            {
              !nodeMetaData.isSingleton && (
                <>
                  <div className="p-1">
                    <div
                      className="flex h-8 cursor-pointer items-center justify-between rounded-lg px-3 text-sm text-text-secondary hover:bg-state-base-hover"
                      onClick={() => {
                        onClosePopup()
                        handleNodesCopy(id)
                      }}
                    >
                      {t('common.copy', { ns: 'workflow' })}
                      <ShortcutsName keys={['ctrl', 'c']} />
                    </div>
                    <div
                      className="flex h-8 cursor-pointer items-center justify-between rounded-lg px-3 text-sm text-text-secondary hover:bg-state-base-hover"
                      onClick={() => {
                        onClosePopup()
                        handleNodesDuplicate(id)
                      }}
                    >
                      {t('common.duplicate', { ns: 'workflow' })}
                      <ShortcutsName keys={['ctrl', 'd']} />
                    </div>
                  </div>
                  <div className="h-px bg-divider-regular"></div>
                </>
              )
            }
            {
              !nodeMetaData.isUndeletable && (
                <>
                  <div className="p-1">
                    <div
                      className={`
                      flex h-8 cursor-pointer items-center justify-between rounded-lg px-3 text-sm text-text-secondary
                      hover:bg-state-destructive-hover hover:text-text-destructive
                      `}
                      onClick={() => handleNodeDelete(id)}
                    >
                      {t('operation.delete', { ns: 'common' })}
                      <ShortcutsName keys={['del']} />
                    </div>
                  </div>
                  <div className="h-px bg-divider-regular"></div>
                </>
              )
            }
          </>
        )
      }
      {
        isWorkflowTool && workflowAppId && (
          <>
            <div className="p-1">
              <a
                href={`/app/${workflowAppId}/workflow`}
                target="_blank"
                className="flex h-8 cursor-pointer items-center rounded-lg px-3 text-sm text-text-secondary hover:bg-state-base-hover"
              >
                {t('panel.openWorkflow', { ns: 'workflow' })}
              </a>
            </div>
            <div className="h-px bg-divider-regular"></div>
          </>
        )
      }
      {
        showHelpLink && nodeMetaData.helpLinkUri && (
          <>
            <div className="p-1">
              <a
                href={nodeMetaData.helpLinkUri}
                target="_blank"
                className="flex h-8 cursor-pointer items-center rounded-lg px-3 text-sm text-text-secondary hover:bg-state-base-hover"
              >
                {t('panel.helpLink', { ns: 'workflow' })}
              </a>
            </div>
            <div className="h-px bg-divider-regular"></div>
          </>
        )
      }
      <div className="p-1">
        <div className="px-3 py-2 text-xs text-text-tertiary">
          <div className="mb-1 flex h-[22px] items-center font-medium">
            {t('panel.about', { ns: 'workflow' }).toLocaleUpperCase()}
          </div>
          <div className="mb-1 leading-[18px] text-text-secondary">{nodeMetaData.description}</div>
          <div className="leading-[18px]">
            {t('panel.createdBy', { ns: 'workflow' })}
            {' '}
            {nodeMetaData.author}
          </div>
        </div>
      </div>
    </div>
  )
})

OperatorPopup.displayName = 'OperatorPopup'
export default OperatorPopup
