import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

interface UseResizeParams {
  direction?: 'horizontal' | 'vertical' | 'both'
  triggerDirection?: 'top' | 'right' | 'bottom' | 'left' | 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  onResized?: (width: number, height: number) => void
  onResize?: (width: number, height: number) => void
}
export const useResize = (params?: UseResizeParams) => {
  const {
    direction = 'both',
    triggerDirection = 'bottom-right',
    minWidth = -Infinity,
    maxWidth = Infinity,
    minHeight = -Infinity,
    maxHeight = Infinity,
    onResized,
    onResize,
  } = params || {}
  const triggerRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const containerWidthRef = useRef(0)
  const containerHeightRef = useRef(0)
  
  const isResizingRef = useRef(false)
  const [prevUserSelectStyle, setPrevUserSelectStyle] = useState(() => getComputedStyle(document.body).userSelect)

  const onStartResize = useCallback((e: MouseEvent) => {
    startXRef.current = e.clientX
    startYRef.current = e.clientY

    containerWidthRef.current = containerRef.current?.offsetWidth || minWidth
    containerHeightRef.current = containerRef.current?.offsetHeight || minHeight
    isResizingRef.current = true
    setPrevUserSelectStyle(getComputedStyle(document.body).userSelect)
    document.body.style.userSelect = 'none'
  }, [minWidth, minHeight])

  const onResizing = useCallback((e: MouseEvent) => {
    if (!isResizingRef.current) {
      return
    }

    if (!containerRef.current) {
      return
    }

    if (direction === 'horizontal' || direction === 'both') {
      const offsetX = e.clientX - startXRef.current
      let width = 0

      if (triggerDirection === 'left' || triggerDirection === 'top-left' || triggerDirection === 'bottom-left') {
        width = containerWidthRef.current - offsetX
      } else if (triggerDirection === 'right' || triggerDirection === 'top-right' || triggerDirection === 'bottom-right') {
        width = containerWidthRef.current + offsetX
      }

      if (width < minWidth) {
        width = minWidth
      }

      if (width > maxWidth) {
        width = maxWidth
      }

      containerRef.current.style.width = `${width}px`
      onResize?.(width, 0)
    }

    if (direction === 'vertical' || direction === 'both') {
      const offsetY = e.clientY - startYRef.current
      let height = 0

      if (triggerDirection === 'top' || triggerDirection === 'top-left' || triggerDirection === 'top-right') {
        height = containerHeightRef.current - offsetY
      } else if (triggerDirection === 'bottom' || triggerDirection === 'bottom-left' || triggerDirection === 'bottom-right') {
        height = containerHeightRef.current + offsetY
      }

      if (height < minHeight) {
        height = minHeight
      }

      if (height > maxHeight) {
        height = maxHeight
      }

      containerRef.current.style.height = `${height}px`
      onResize?.(0, height)
    }
  }, [
    direction,
    triggerDirection,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
    onResize,
  ])

  const onStopResize = useCallback(() => {
    isResizingRef.current = false
    document.body.style.userSelect = prevUserSelectStyle

    if (onResized && containerRef.current) {
      onResized(containerRef.current.offsetWidth, containerRef.current.offsetHeight)
    }
  }, [prevUserSelectStyle, onResized])

  useEffect(() => {
    const element = triggerRef.current
    element?.addEventListener('mousedown', onStartResize)
    document.addEventListener('mousemove', onResizing)
    document.addEventListener('mouseup', onStopResize)

    return () => {
      element?.removeEventListener('mousedown', onStartResize)
      document.removeEventListener('mousemove', onResizing)
      document.removeEventListener('mouseup', onStopResize)
    }
  }, [onStartResize, onResizing, onStopResize])

  return {
    triggerRef,
    containerRef,
  }
}
