import { debounce } from 'es-toolkit/compat'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { ChatItem } from './types'

interface UseChatLayoutOptions {
  chatList: ChatItem[]
  sidebarCollapseState?: boolean
}

export const useChatLayout = ({ chatList, sidebarCollapseState }: UseChatLayoutOptions) => {
  const [width, setWidth] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const containerInnerRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const footerInnerRef = useRef<HTMLDivElement>(null)
  const userScrolledRef = useRef(false)
  const isAutoScrollingRef = useRef(false)
  const prevFirstMessageIdRef = useRef<string | undefined>(undefined)

  const onScrollToBottom = useCallback(() => {
    if (chatList?.length > 1 && containerRef.current && !userScrolledRef.current) {
      isAutoScrollingRef.current = true
      containerRef.current.scrollTop = containerRef.current.scrollHeight

      requestAnimationFrame(() => {
        isAutoScrollingRef.current = false
      })
    }
  }, [chatList?.length])

  const onWindowResize = useCallback(() => {
    if (containerRef.current) {
      setWidth(document.body.clientWidth - (containerRef.current.clientWidth + 16) - 8)
    }

    if (containerRef.current && footerRef.current) {
      footerRef.current.style.width = `${containerRef.current.clientWidth}px`
    }

    if (containerInnerRef.current && footerInnerRef.current) {
      footerInnerRef.current.style.width = `${containerInnerRef.current.clientWidth}px`
    }
  }, [])

  useEffect(() => {
    onScrollToBottom()
    const animationFrame = requestAnimationFrame(onWindowResize)

    return () => {
      cancelAnimationFrame(animationFrame)
    }
  }, [onScrollToBottom, onWindowResize])

  useEffect(() => {
    if (containerRef.current) {
      requestAnimationFrame(() => {
        onScrollToBottom()
        onWindowResize()
      })
    }
  })

  useEffect(() => {
    const debouncedHandler = debounce(onWindowResize, 200)
    window.addEventListener('resize', debouncedHandler)

    return () => {
      window.removeEventListener('resize', debouncedHandler)
      debouncedHandler.cancel()
    }
  }, [onWindowResize])

  useEffect(() => {
    if (footerRef.current && containerRef.current) {
      const containerObserver = new ResizeObserver((entries) => {
        if (containerRef.current) {
          for (const entry of entries) {
            const { blockSize } = entry.borderBoxSize[0]
            containerRef.current!.style.paddingBottom = `${blockSize}px`
            onScrollToBottom()
          }
        }
      })

      containerObserver.observe(footerRef.current)
      
      const footerObserver = new ResizeObserver((entries) => {
        if (footerRef.current) {
          for (const entry of entries) {
            const { inlineSize } = entry.borderBoxSize[0]
            footerRef.current.style.width = `${inlineSize}px`
          }
        }
      })
      footerObserver.observe(containerRef.current)

      return () => {
        containerObserver.disconnect()
        footerObserver.disconnect()
      }
    }
  }, [onScrollToBottom])

  useEffect(() => {
    const setUserScrolled = () => {
      const container = containerRef.current
      if (!container) {
        return
      }

      if (isAutoScrollingRef.current) {
        return
      }

      const distanceToBottom = container.scrollHeight - container.clientHeight - container.scrollTop
      const scrollUpThreshold = 100

      userScrolledRef.current = distanceToBottom > scrollUpThreshold
    }

    const container = containerRef.current
    if (!container) {
      return
    }

    container.addEventListener('scroll', setUserScrolled)
    return () => container.removeEventListener('scroll', setUserScrolled)
  }, [])

  useEffect(() => {
    const firstMessageId = chatList[0]?.id
    if (chatList.length <= 1 || (firstMessageId && prevFirstMessageIdRef.current !== firstMessageId)) {
      userScrolledRef.current = false
    }
    prevFirstMessageIdRef.current = firstMessageId
  }, [chatList])

  useEffect(() => {
    if (!sidebarCollapseState) {
      const timer = setTimeout(onWindowResize, 200)
      return () => clearTimeout(timer)
    }
  }, [onWindowResize, sidebarCollapseState])

  return {
    width,
    containerRef,
    containerInnerRef,
    footerRef,
    footerInnerRef,
  }
}
