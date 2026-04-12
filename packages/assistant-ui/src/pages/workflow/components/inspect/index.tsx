import type { FC } from 'react'
import { debounce } from 'es-toolkit/compat'
import {
  useCallback,
  useMemo,
} from 'react'
import { clsx } from 'clsx'
import Panel from './panel'

export const Inspect: FC = () => {
  
  return (
    <div className={clsx('relative pb-1')}>
      <div
        // ref={triggerRef}
        className="absolute -top-1 left-0 flex h-1 w-full cursor-row-resize resize-y items-center justify-center"
      >
        <div className="h-0.5 w-10 rounded-xs bg-state-base-handle hover:w-full hover:bg-state-accent-solid active:w-full active:bg-state-accent-solid"></div>
      </div>
      <div
        // ref={containerRef}
        className={clsx('overflow-hidden rounded-2xl border-[0.5px] border-components-panel-border bg-components-panel-bg shadow-xl')}
        style={{ height: `${300}px` }}
      >
        <Panel />
      </div>
    </div>
  )
}

export default Inspect
