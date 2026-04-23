import AudioGallery from '@/components/audio-gallery'
import { memo, useMemo } from 'react'

interface Node {
  properties?: { src?: string | string[] }
  children?: { properties?: { src?: string | string[] } }[]
}

const normalizeSrc = (src?: string | string[]): string[] => {
  if (Array.isArray(src)) {
    return src.filter((item): item is string => typeof item === 'string' && item.length > 0)
  }

  if (typeof src === 'string' && src.length > 0) {
    return [src]
  }

  return []
}

const useSrcs = (node: Node): string[] => {
  return useMemo(() => {
    const childSrcs = (node.children ?? []).flatMap((child) => {
      return normalizeSrc(child.properties?.src)
    })

    if (childSrcs.length > 0)
      return childSrcs

    return normalizeSrc(node.properties?.src)
  }, [node])
}

interface AudioProps {
  node: Node
}

export const Audio: React.FC<AudioProps> = memo(({ node }) => {
  const srcs = useSrcs(node)

  if (srcs.length === 0) {
    return null
  }

  return <AudioGallery key={srcs.join()} srcs={srcs} />
})

Audio.displayName = 'Audio'

export default Audio
