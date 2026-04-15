import { useEffect } from 'react'
import { clsx } from 'clsx'
import { useUpdateNodeInternals } from 'reactflow'
import { ErrorHandleTypeEnum, NodeRunningStatus, type Node } from '../types'
import { NodeSourceHandle } from './node-handle'

interface ErrorHandleOnNodeProps extends Pick<Node, 'id' | 'data'> {}
const ErrorHandleOnNode: React.FC<ErrorHandleOnNodeProps> = ({
  id,
  data,
}) => {
  const { error_strategy } = data
  const updateNodeInternals = useUpdateNodeInternals()

  useEffect(() => {
    if (error_strategy === ErrorHandleTypeEnum.FailBranch) {
      updateNodeInternals(id)
    }
  }, [error_strategy, id, updateNodeInternals])

  if (!error_strategy)
    return null

  return (
    <div className="relative px-3 pb-2 pt-1">
      <div className={clsx(
        'relative flex h-6 items-center justify-between rounded-md bg-workflow-block-parma-bg px-[5px]',
        data._runningStatus === NodeRunningStatus.Exception && 'border-[0.5px] border-components-badge-status-light-warning-halo bg-state-warning-hover',
      )}
      >
        <div className="system-xs-medium-uppercase text-text-tertiary">
          Failure
        </div>
        <div className={clsx(
          'system-xs-medium text-text-secondary',
          data._runningStatus === NodeRunningStatus.Exception && 'text-text-warning',
        )}
        >
          { error_strategy === ErrorHandleTypeEnum.DefaultValue && "Default Value" }
          { error_strategy === ErrorHandleTypeEnum.FailBranch && "Fail Branch" }
        </div>
        {
          error_strategy === ErrorHandleTypeEnum.FailBranch && <NodeSourceHandle
            id={id}
            data={data}
            handleId={ErrorHandleTypeEnum.FailBranch}
            handleClassName="top-1/2! -right-[21px]! -translate-y-1/2! after:bg-workflow-link-line-failure-button-bg!"
          />
        }
      </div>
    </div>
  )
}

export default ErrorHandleOnNode
