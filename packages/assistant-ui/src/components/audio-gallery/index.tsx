import AudioPlayer from './audio-player'
import * as React from 'react'

interface AudioGalleryProps {
  srcs: string[]
}

export const AudioGallery: React.FC<AudioGalleryProps> = React.memo(({ srcs }) => {
  const validSrcs = srcs.filter(src => src)

  if (validSrcs.length === 0) {
    return null
  }

  return (
    <div className="my-3">
      <AudioPlayer srcs={validSrcs} />
    </div>
  )
})

AudioGallery.displayName = 'AudioGallery'
export default AudioGallery
