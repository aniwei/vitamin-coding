import VideoPlayer from './video-player'
import * as React from 'react'

interface VideoGalleryProps {
  srcs: string[]
}

export const VideoGallery: React.FC<VideoGalleryProps> = React.memo(({ srcs }) => {
  const validSrcs = srcs.filter(src => src)
  if (validSrcs.length === 0) {
    return null
  }

  return (
    <div className="my-3">
      <VideoPlayer srcs={validSrcs} />
    </div>
  )
})

export default VideoGallery
