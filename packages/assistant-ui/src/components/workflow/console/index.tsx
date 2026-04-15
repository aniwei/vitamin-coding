import Panel from './panel'
import { debounce } from 'es-toolkit/compat'
import { memo, useCallback, useState } from 'react'
import { useResize } from '@/hooks/use-resize'
import { clsx } from 'clsx'
import type { FC } from 'react'

export const Console: FC = memo(() => {
  const [height, setHeight] = useState(320)
  const handleResize = useCallback((width: number, height: number) => {
    localStorage.setItem('workflow-inspector-panel-height', `${height}`)
    setHeight(height)
  }, [])

  const {
    triggerRef,
    containerRef,
  } = useResize({
    direction: 'vertical',
    triggerDirection: 'top',
    minHeight: 120,
    maxHeight: 600,
    onResize: debounce(handleResize),
  })

  return (
    <div className={clsx('relative pb-1')}>
      <div
        ref={triggerRef}
        className="absolute -top-1 left-0 flex h-1 w-full cursor-row-resize resize-y items-center justify-center"
      >
        <div className="h-0.5 w-10 rounded-xs bg-state-base-handle hover:w-full hover:bg-state-accent-solid active:w-full active:bg-state-accent-solid"></div>
      </div>
      <div
        ref={containerRef}
        className={clsx('overflow-hidden rounded-2xl border-[0.5px] border-components-panel-border bg-components-panel-bg shadow-xl')}
        style={{ height: `${height}px` }}
      ><Panel /></div>
    </div>
  )
})

Console.displayName = 'Console'
export default Console
