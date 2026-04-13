import { 
  useCallback, 
  useEffect, 
  useRef, 
  useState 
} from 'react'
import { noop } from 'es-toolkit/function'
import { createPortal } from 'react-dom'
import { useHotkeys } from 'react-hotkeys-hook'
import { toast } from '@/components/ui/toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import * as React from 'react'
import type { FC } from 'react'

interface ImagePreviewProps {
  url: string
  title: string
  onCancel: () => void
  onPrev?: () => void
  onNext?: () => void
}

const isBase64 = (str: string): boolean => {
  try { 
    return btoa(atob(str)) === str 
  } catch { 
    return false
  }
}

export const ImagePreview: FC<ImagePreviewProps> = React.memo(({
  url,
  title,
  onCancel,
  onPrev,
  onNext,
}) => {
  const imgRef = useRef<HTMLImageElement>(null)
  const dragStartRef = useRef({ x: 0, y: 0 })

  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [copied, setCopied] = useState(false)

  const openInNewTab = () => {
    if (url.startsWith('http') || url.startsWith('https')) {
      window.open(url, '_blank')
    } else if (url.startsWith('data:image')) {
      const win = window.open()
      win?.document.write(`<img src="${url}" alt="${title}" />`)
    } else {
      toast.error(`Unable to open image: ${url}`)
    }
  }

  const downloadImage = () => {
    if (
      url.startsWith('http') || 
      url.startsWith('https') || 
      url.startsWith('data:image')
    ) {
      // TODO
      // downloadUrl({ url, fileName: title, target: '_blank' })
      return
    }

    toast.error(`Unable to open image: ${url}`)
  }

  const zoomIn = () => {
    setScale(prevScale => Math.min(prevScale * 1.2, 15))
  }

  const zoomOut = () => {
    setScale((prevScale) => {
      const newScale = Math.max(prevScale / 1.2, 0.5)

      if (newScale === 1) {
        setPosition({ x: 0, y: 0 }) // Reset position when fully zoomed out
      }

      return newScale
    })
  }

  const base64ToBlob = (base64: string, type = 'image/png'): Blob => {
    const byteCharacters = atob(base64)
    const byteArrays = []

    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512)
      const byteNumbers = Array.from({ length: slice.length })

      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i)
      }

      const byteArray = new Uint8Array(byteNumbers as any)
      byteArrays.push(byteArray)
    }

    return new Blob(byteArrays, { type })
  }

  const copyImage = useCallback(() => {
    const shareImage = async () => {
      try {
        const base64Data = url.split(',')[1]
        const blob = base64ToBlob(base64Data, 'image/png')

        await navigator.clipboard.write([new ClipboardItem({
            [blob.type]: blob,
        })])

        setCopied(true)

        toast.success('Image copied')
      } catch (err) {
        console.error('Failed to copy image:', err)

        // TODO
        // downloadUrl({ url, fileName: `${title}.png` })
        toast.info('Failed to copy image. Downloading instead.')
      }
    }

    shareImage()
  }, [title, url])

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0) {
      zoomIn()
    } else {
      zoomOut()
    }
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (scale > 1) {
      setDragging(true)
      dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y }
    }
  }, [scale, position])

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (dragging && scale > 1) {
      const deltaX = e.clientX - dragStartRef.current.x
      const deltaY = e.clientY - dragStartRef.current.y

      // Calculate boundaries
      const imgRect = imgRef.current?.getBoundingClientRect()
      const containerRect = imgRef.current?.parentElement?.getBoundingClientRect()

      if (imgRect && containerRect) {
        const maxX = (imgRect.width * scale - containerRect.width) / 2
        const maxY = (imgRect.height * scale - containerRect.height) / 2

        setPosition({
          x: Math.max(-maxX, Math.min(maxX, deltaX)),
          y: Math.max(-maxY, Math.min(maxY, deltaY)),
        })
      }
    }
  }, [dragging, scale])

  const onMouseUp = useCallback(() => setDragging(false), [])

  useEffect(() => {
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseUp])

  useHotkeys('esc', onCancel)
  useHotkeys('up', zoomIn)
  useHotkeys('down', zoomOut)
  useHotkeys('left', onPrev || noop)
  useHotkeys('right', onNext || noop)

  return createPortal(
    <div
      style={{ cursor: scale > 1 ? 'move' : 'default' }}
      className="image-preview-container fixed inset-0 z-1000 flex items-center justify-center bg-black/80 p-8"
      onClick={e => e.stopPropagation()}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      tabIndex={-1}
    >
      { }
      { }
      <img
        ref={imgRef}
        alt={title}
        src={isBase64(url) ? `data:image/png;base64,${url}` : url}
        className="max-h-full max-w-full"
        style={{
          transform: `scale(${scale}) translate(${position.x}px, ${position.y}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease-in-out',
        }}
        data-testid="image-preview-image"
      />
      <Tooltip>
        <TooltipTrigger
          render={(
            <div
              className="absolute right-48 top-6 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg"
              onClick={copyImage}
            >
              {
                copied
                  ? <span className="i-ri-file-copy-line h-4 w-4 text-green-500"/>
                  : <span className="i-ri-file-copy-line h-4 w-4 text-gray-500"/>
              }
            </div>
          )}
        />
        <TooltipContent>{copied ? 'Image Copied' : 'Copy Image'}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              className="absolute right-40 top-6 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg"
              onClick={zoomOut}
            >
              <span className="i-ri-zoom-out-line h-4 w-4 text-gray-500" data-testid="image-preview-zoom-out-button" />
            </div>
          }
        />
        <TooltipContent>Zoom Out</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              className="absolute right-32 top-6 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg"
              onClick={zoomIn}
            >
              <span className="i-ri-zoom-in-line h-4 w-4 text-gray-500" data-testid="image-preview-zoom-in-button" />
            </div>
          }
        />
        <TooltipContent>Zoom In</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              className="absolute right-24 top-6 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg"
              onClick={downloadImage}
            >
              <span className="i-ri-download-cloud-2-line h-4 w-4 text-gray-500" data-testid="image-preview-download-button" />
            </div>
          }
        />
        <TooltipContent>Download Image</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              className="absolute right-16 top-6 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg"
              onClick={openInNewTab}
            >
              <span className="i-ri-add-box-line h-4 w-4 text-gray-500" data-testid="image-preview-open-in-tab-button" />
            </div>
          }
        />
        <TooltipContent>Open in New Tab</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              className="absolute right-6 top-6 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-white/8 backdrop-blur-[2px]"
              onClick={onCancel}
            >
              <span className="i-ri-close-line h-4 w-4 text-gray-500" data-testid="image-preview-close-button" />
            </div>
          }
        />
        <TooltipContent>Cancel</TooltipContent>
      </Tooltip>
    </div>,
    document.body,
  )
})

export default ImagePreview
