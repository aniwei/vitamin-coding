import AudioGallery from '@/components/audio-gallery'
import { memo } from 'react'

interface AudioProps {
  node: {
    properties?: {
      src?: string
    }
    children: any[]
  }
}

export const Audio: React.FC<AudioProps> = memo(({ node }) => {
  const srcs = node.children.filter((child: any) => 'properties' in child).map((child: any) => (child as any).properties.src)

  if (srcs.length === 0) {
    const src = node.properties?.src
    if (src) {
      return <AudioGallery key={src} srcs={[src]} />
    }

    return null
  }
  
  return <AudioGallery key={srcs.join()} srcs={srcs} />
})

Audio.displayName = 'Audio'

export default Audio
