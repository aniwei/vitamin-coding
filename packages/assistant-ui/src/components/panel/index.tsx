import { debounce, update } from 'es-toolkit/compat'
import { clsx } from 'clsx'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { FC, ReactNode } from 'react'
import type { Node } from '../../pages/workflow/types'
import { useResize } from '@/hooks/use-resize'

interface PanelProps {
  id: Node['id']
  data: Node['data']
  visible: boolean
  storeKey: string
  containerWidth: number
  style: React.CSSProperties
  children: ReactNode
}

const MIN_WIDTH = 400
const RESERVED_WIDTH = 400
const DEFAULT_MAX_WIDTH = 720

const getMaxNodeWidth = (
  width?: number, 
  otherWidth?: number, 
  reservedWidth = MIN_WIDTH
) => {
  if (!width) {
    return DEFAULT_MAX_WIDTH
  }

  const available = width - (otherWidth || 0) - reservedWidth
  return Math.max(available, MIN_WIDTH)
}

const clampWidth = (width: number, maxNodeWidth: number) => {
  return Math.max(MIN_WIDTH, Math.min(width, maxNodeWidth))
}

const getCompressedWidth = (
  width: number, 
  containerWidth?: number, 
  reservedWidth = MIN_WIDTH
) => {
  if (!containerWidth) {
    return undefined
  }

  const total = width + reservedWidth
  if (total <= containerWidth) {
    return undefined
  }

  return clampWidth(
    containerWidth - reservedWidth, 
    getMaxNodeWidth(containerWidth, reservedWidth)
  )
}

export const Panel: FC<PanelProps> = memo(props => {
  const {
    id,
    data,
    visible,
    storeKey,
    containerWidth,
    style,
    children
  } = props

  const [width, setWidth] = useState(400)
  const maxWidth = useMemo(() => {
    return getMaxNodeWidth(containerWidth, RESERVED_WIDTH)
  }, [containerWidth])

  const updateWidth = useCallback((width: number, source: 'user' | 'system' = 'user') => {
    const value = clampWidth(width, maxWidth)

    if (source === 'user') {
      localStorage.setItem(storeKey, `${value}`)
    }

    setWidth(value)
  }, [maxWidth, storeKey])

  const onResize = useCallback((width: number) => {
    updateWidth(width, 'user')
  }, [updateWidth])

  const {
    triggerRef,
    containerRef,
  } = useResize({
    direction: 'horizontal',
    triggerDirection: 'left',
    minWidth: 400,
    maxWidth: maxWidth,
    onResize: debounce(onResize),
  })

  const debounceUpdate = debounce((width: number) => {
    updateWidth(width, 'system')
  })

  useEffect(() => {
    const compressedWidth = getCompressedWidth(
      width, 
      containerWidth, 
      RESERVED_WIDTH
    )

    if (compressedWidth !== undefined) {
      debounceUpdate(compressedWidth)
    }
  }, [width, containerWidth, debounceUpdate])


  return (
    <div
      style={style}
      className={clsx(
        'relative mr-1 h-full',
        visible && 'absolute z-0 mr-2 w-[400px] overflow-hidden rounded-2xl border-[0.5px] border-components-panel-border shadow-lg transition-all',
      )}
    >
      <div ref={triggerRef} className="absolute -left-1 top-0 flex h-full w-1 cursor-col-resize resize-x items-center justify-center">
        <div className="h-10 w-0.5 rounded-xs bg-state-base-handle hover:h-full hover:bg-state-accent-solid active:h-full active:bg-state-accent-solid"></div>
      </div>
      <div 
        ref={containerRef}
        style={{ width: `${width}px` }}
        className={clsx(
          'flex h-full flex-col rounded-2xl border-[0.5px] border-components-panel-border bg-components-panel-bg shadow-lg transition-[width] ease-linear', 
          'overflow-hidden'
        )}
      >
        <div className="sticky top-0 z-10 shrink-0 border-b-[0.5px] border-divider-regular bg-components-panel-bg">
          <div className="flex items-center px-4 pb-1 pt-4">
          </div>
          <div className="p-2">
            
          </div>
          
        </div>
      </div>
    </div>
  )
})

export default Panel
