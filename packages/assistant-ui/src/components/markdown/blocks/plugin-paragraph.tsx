import ImageGallery from '@/components/image-gallery'
import { memo, useEffect, useMemo, useState } from 'react'
import { getMarkdownImageURL, hasImageChild } from '../shared'
import * as React from 'react'

import type { ExtraProps } from 'streamdown'
import type { SimplePluginInfo } from '../streamdown-wrapper'

type HastChildNode = {
  tagName?: string
  properties?: { src?: string, [key: string]: unknown }
}

type PluginParagraphProps = {
  pluginInfo?: SimplePluginInfo
  node?: ExtraProps['node']
  children?: React.ReactNode
  data: Blob | undefined
}

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

export const PluginParagraph: React.FC<PluginParagraphProps> = memo(({ 
  pluginInfo, 
  data,
  node, 
  children 
}) => {
  const { pluginId } = pluginInfo || {}
  const childrenNode = node?.children as HastChildNode[] | undefined
  const firstChild = childrenNode?.[0]
  const isImageParagraph = firstChild?.tagName === 'img'
  const imageSrc = isImageParagraph 
    ? firstChild?.properties?.src 
    : undefined

  const blobUrl = useBlobUrl(data)

  const url = useMemo(() => {
    if (blobUrl)
      return blobUrl

    if (isImageParagraph && imageSrc)
      return getMarkdownImageURL(imageSrc, pluginId)

    return ''
  }, [blobUrl, imageSrc, isImageParagraph, pluginId])

  if (isImageParagraph) {
    const remainingChildren = Array.isArray(children) && children.length > 1 ? children.slice(1) : undefined

    return (
      <div className="markdown-img-wrapper">
        <ImageGallery srcs={[url]} />
        { remainingChildren && <div className="mt-2">{remainingChildren}</div> }
      </div>
    )
  }

  if (hasImageChild(childrenNode)) {
    return <div className="markdown-p">{children}</div>
  }

  return <p>{children}</p>
})

PluginParagraph.displayName = 'PluginParagraph'
