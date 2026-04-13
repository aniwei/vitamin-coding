import ImageGallery from '@/components/image-gallery'
import { useEffect, useMemo, useState } from 'react'
import { getMarkdownImageURL, hasImageChild } from './utils'
import * as React from 'react'

import type { ExtraProps } from 'streamdown'
import type { SimplePluginInfo } from '../streamdown-wrapper'

interface HastChildNode {
  tagName?: string
  properties?: { src?: string, [key: string]: unknown }
}

interface PluginParagraphProps {
  pluginInfo?: SimplePluginInfo
  node?: ExtraProps['node']
  children?: React.ReactNode
  data: Blob | undefined
}

export const PluginParagraph: React.FC<PluginParagraphProps> = ({ 
  pluginInfo, 
  data,
  node, 
  children 
}) => {
  const { pluginUniqueIdentifier, pluginId } = pluginInfo || {}
  const childrenNode = node?.children as HastChildNode[] | undefined
  const firstChild = childrenNode?.[0]
  const isImageParagraph = firstChild?.tagName === 'img'
  const imageSrc = isImageParagraph 
    ? firstChild?.properties?.src 
    : undefined

  const [blobUrl, setBlobUrl] = useState<string>()

  useEffect(() => {
    if (!data) {
      setBlobUrl(undefined)
    } else {
      const objectUrl = URL.createObjectURL(data as Blob)
      setBlobUrl(objectUrl)
    }

    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
      }
    }
  }, [data])

  const url = useMemo(() => {
    if (blobUrl) {
      return blobUrl
    }

    if (isImageParagraph && imageSrc) {
      return getMarkdownImageURL(imageSrc, pluginId)
    }

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
}
