import ImageGallery from '@/components/image-gallery'
import { memo, useEffect, useMemo, useState } from 'react'
import { getMarkdownImageURL } from '../shared'
import type { SimplePluginInfo } from '../streamdown-wrapper'

const useBlobUrl = (data: Blob | undefined): string | undefined => {
  const [blobUrl, setBlobUrl] = useState<string>()

  useEffect(() => {
    if (!data) {
      setBlobUrl(undefined)
      return
    }

    const objectUrl = URL.createObjectURL(data)
    setBlobUrl(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [data])

  return blobUrl
}

interface ImageProps {
  src: string
  data?: Blob
  pluginInfo?: SimplePluginInfo
}

export const PluginImage: React.FC<ImageProps> = memo(({ 
  src, 
  data,
  pluginInfo 
}) => {
  const { pluginId } = pluginInfo || {}
  const blobUrl = useBlobUrl(data)

  const url = useMemo(() => {
    if (blobUrl)
      return blobUrl
    return getMarkdownImageURL(src, pluginId)
  }, [blobUrl, pluginId, src])

  const srcs = useMemo(() => [url], [url])

  return (
    <div className="markdown-img-wrapper">
      <ImageGallery srcs={srcs} />
    </div>
  )
})

PluginImage.displayName = 'PluginImage'

export default PluginImage
