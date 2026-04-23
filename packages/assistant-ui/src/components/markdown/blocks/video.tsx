import VideoGallery from '@/components/video-gallery'
import { memo, useMemo } from 'react'

interface MediaNode {
  properties?: { src?: string | string[] }
  children?: { properties?: { src?: string | string[] } }[]
}

const normalizeMediaSrc = (src?: string | string[]): string[] => {
  if (Array.isArray(src)) {
    return src.filter((item): item is string => typeof item === 'string' && item.length > 0)
  }

  if (typeof src === 'string' && src.length > 0)
    return [src]

  return []
}

const useMediaSrcs = (node: MediaNode): string[] => {
  return useMemo(() => {
    const childSrcs = (node.children ?? []).flatMap((child) => {
      return normalizeMediaSrc(child.properties?.src)
    })

    if (childSrcs.length > 0)
      return childSrcs

    return normalizeMediaSrc(node.properties?.src)
  }, [node])
}

interface VideoProps {
  node: MediaNode
}


export const Video: React.FC<VideoProps> = memo(({ node }) => {
  const srcs = useMediaSrcs(node)

  if (srcs.length === 0)
    return null

  return <VideoGallery key={srcs.join()} srcs={srcs} />
})

Video.displayName = 'Video'

export default Video
