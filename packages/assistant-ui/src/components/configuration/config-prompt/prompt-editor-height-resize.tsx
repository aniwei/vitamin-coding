import { clsx } from 'clsx'
import { useDebounceFn } from 'ahooks'
import { useCallback, useEffect, useState } from 'react'
import * as React from 'react'
import type { FC } from 'react'

type PromptEditorHeightResizeProps = {
  className?: string
  height: number
  minHeight: number
  onHeightChange: (height: number) => void
  children: React.JSX.Element
  footer?: React.JSX.Element
  resizable?: boolean
}

export const PromptEditorHeightResize: FC<PromptEditorHeightResizeProps> = React.memo(({
  className,
  height,
  minHeight,
  children,
  footer,
  resizable,
  onHeightChange,
}) => {
  const [clientY, setClientY] = useState(0)
  const [resizing, setResizing] = useState(false)
  const [prevUserSelectStyle, setPrevUserSelectStyle] = useState(() => getComputedStyle(document.body).userSelect)
  const [oldHeight, setOldHeight] = useState(height)

  const handleStartResize = useCallback((e: React.MouseEvent<HTMLElement>) => {
    setClientY(e.clientY)
    setResizing(true)
    setOldHeight(height)
    setPrevUserSelectStyle(getComputedStyle(document.body).userSelect)
    document.body.style.userSelect = 'none'
  }, [height])

  const handleStopResize = useCallback(() => {
    setResizing(false)
    document.body.style.userSelect = prevUserSelectStyle
  }, [prevUserSelectStyle])

  const { run: didHandleResize } = useDebounceFn((e) => {
    if (!resizing) {
      return
    }

    const offset = e.clientY - clientY
    let newHeight = oldHeight + offset
    
    if (newHeight < minHeight) {
      newHeight = minHeight
    }
    
    onHeightChange(newHeight)
  }, {
    wait: 0,
  })

  const handleResize = useCallback(didHandleResize, [resizing, height, minHeight, clientY])

  useEffect(() => {
    document.addEventListener('mousemove', handleResize)
    
    return () => {
      document.removeEventListener('mousemove', handleResize)
    }
  }, [handleResize])

  useEffect(() => {
    document.addEventListener('mouseup', handleStopResize)
    return () => {
      document.removeEventListener('mouseup', handleStopResize)
    }
  }, [handleStopResize])

  return (
    <div className="relative">
      <div
        className={clsx(className, 'overflow-y-auto')}
        style={{ height }}
      >{children}</div>
      {footer}
      {
        resizable && <div
          className="absolute bottom-0 left-0 flex h-2 w-full cursor-row-resize justify-center"
          onMouseDown={handleStartResize}
        >
          <div className="h-[3px] w-5 rounded-xs bg-gray-300"></div>
        </div>
      }
    </div>
  )
})

PromptEditorHeightResize.displayName = 'PromptEditorHeightResize'
export default PromptEditorHeightResize 
