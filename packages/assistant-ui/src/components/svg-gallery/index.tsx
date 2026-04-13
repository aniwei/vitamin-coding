import DOMPurify from 'dompurify'
import ImagePreview from '@/components/image-preview'
import { SVG } from '@svgdotjs/svg.js'
import { useEffect, useRef, useState } from 'react'

const SVGToDataURL = (svgElement: Element): string => {
  const svgString = new XMLSerializer().serializeToString(svgElement)
  const base64String = Buffer.from(svgString).toString('base64')
  return `data:image/svg+xml;base64,${base64String}`
}

const useResize = () => {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  })

  useEffect(() => {
    const onResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return windowSize
}

interface SVGGalleryProps {
  content: string
}

const SVGGallery: React.FC<SVGGalleryProps> = ({ content }) => {
  const [url, setImagePreview] = useState('')
  const svgRef = useRef<HTMLDivElement>(null)
  const windowSize = useResize()

  useEffect(() => {
    if (!svgRef.current)
      return

    try {
      svgRef.current.innerHTML = ''
      const draw = SVG().addTo(svgRef.current)

      const parser = new DOMParser()
      const svgDoc = parser.parseFromString(content, 'image/svg+xml')
      const svgElement = svgDoc.documentElement

      if (!(svgElement instanceof SVGElement)) {
        throw new Error('Invalid SVG content')
      }

      const originalWidth = Number.parseInt(svgElement.getAttribute('width') || '400', 10)
      const originalHeight = Number.parseInt(svgElement.getAttribute('height') || '600', 10)
      draw.viewbox(0, 0, originalWidth, originalHeight)

      svgRef.current.style.width = `${Math.min(originalWidth, 298)}px`

      const root = draw.svg(DOMPurify.sanitize(content))
      root.click(() => setImagePreview(SVGToDataURL(svgElement as Element)))
    } catch {
      /* v8 ignore next 2 -- if unmounted while handling parser/render errors, ref becomes null; guard avoids writing to a detached node. @preserve */
      if (!svgRef.current) {
        return
      }
      
      svgRef.current.innerHTML = '<span style="padding: 1rem;">Error rendering SVG. Wait for the image content to complete.</span>'
    }
  }, [content, windowSize])

  return (
    <>
      <div
        ref={svgRef}
        style={{
          maxHeight: '80vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: 'pointer',
          wordBreak: 'break-word',
          whiteSpace: 'normal',
          margin: '0 auto',
        }}
      />
      {
        url && <ImagePreview 
          url={url} 
          title="Preview" 
          onCancel={() => setImagePreview('')} 
        />
      }
    </>
  )
}

SVGGallery.displayName = 'SVGGallery'

export default SVGGallery
