import ImageGallery from '@/components/image-gallery'
import { memo } from 'react'
import { hasImageChild } from '../shared'

interface ParagraphProps {
  node?: any
}

export const Paragraph = memo(({ node }: ParagraphProps) => {
  const children = node?.children
  const hasImage = hasImageChild(children)

  if (hasImage) {
    if (children[0]?.tagName === 'img') {
      return (
        <div className="markdown-img-wrapper">
          <ImageGallery srcs={[children[0].properties.src]} />
          {
            Array.isArray(children) && children.length > 1
              ? <div className="mt-2">{children.slice(1)}</div>
              : null
          }
        </div>
      )
    }
    
    return <div className="markdown-p">{children}</div>
  }

  return <p>{children}</p>
})

export default Paragraph
