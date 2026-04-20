import ImageGallery from '@/components/image-gallery'
import { memo } from 'react'
import { hasImageChild } from '../shared'
import { MdastNode } from '../types'



type ParagraphProps = {
  node?: MdastNode
  children?: React.ReactNode
}

export const Paragraph = memo((props: ParagraphProps) => {
  const { node } = props
  const children = node?.children ?? []
  const hasImage = hasImageChild(children)

  if (hasImage) {
    if (children[0]?.tagName === 'img') {
      return (
        <div className="markdown-img-wrapper">
          <ImageGallery srcs={[children[0].properties?.src as string]} />
          {
            Array.isArray(props.children) && props.children.length > 1
              ? <div className="mt-2">{props.children?.slice(1)}</div>
              : null
          }
        </div>
      )
    }
    
    return <div className="markdown-p">{props.children}</div>
  }

  return <p>{props.children}</p>
})

export default Paragraph
