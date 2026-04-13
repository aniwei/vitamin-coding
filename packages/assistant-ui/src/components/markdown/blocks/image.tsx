import ImageGallery from '@/components/image-gallery'
import { memo, useMemo } from 'react'

interface ImageProps {
  src: string
}

export const Image: React.FC<ImageProps> = memo(({ src }) => {
  const srcs = useMemo(() => [src], [src])
  return <div className="markdown-img-wrapper">
    <ImageGallery srcs={srcs} />
  </div>
})

export default Image
