import type { FC } from 'react'
import {
  RiCloseLine,
} from '@remixicon/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'

const Panel: FC = () => {
  return (
    <div className={clsx('relative flex h-full')}>
      <div
        className={clsx(
          'w-60 shrink-0 border-r border-divider-burn',
          'absolute left-0 top-0 z-10 h-full w-[217px] rounded-xl border-[0.5px] border-components-panel-border bg-components-panel-bg shadow-lg backdrop-blur-xs'
        )}
      >
        {/* <Left
          currentNodeVar={currentNodeInfo as currentVarType}
          handleVarSelect={handleNodeVarSelect}
        /> */}
      </div>
      {/* right */}
      <div className="w-0 grow">
        {/* <Right
          nodeId={currentFocusNodeId!}
          isValueFetching={isCurrentNodeVarValueFetching}
          currentNodeVar={currentNodeInfo as currentVarType}
          handleOpenMenu={() => setShowLeftPanel(true)}
        /> */}
      </div>
    </div>
  )
}

export default Panel
