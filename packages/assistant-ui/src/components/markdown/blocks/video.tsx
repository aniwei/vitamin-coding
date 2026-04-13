import VideoGallery from '@/components/video-gallery'
import { memo } from 'react'
import * as React from 'react'

interface VideoProps {
  node: {
    properties?: { src?: string | string[]
      [key: string]: any
    }
    children?: { properties?: { src?: string } }[]
    [key: string]: any
  }
}


export const Video: React.FC<VideoProps> = memo(({ node }) => {
  const srcs = node.children?.filter((child: any) => 'properties' in child).map((child: any) => (child as any).properties.src) || []
  
  if (srcs.length === 0) {
    const src = node.properties?.src
    if (src) {
      return <VideoGallery key={src} srcs={[src]} />
    }

    return null
  }

  return <VideoGallery key={srcs.join()} srcs={srcs} />
})

Video.displayName = 'Video'

export default Video
