
import { ImagePreview } from '@/components/image-preview'
import { useState, useMemo } from 'react'
import { clsx } from 'clsx'
import * as React from 'react'
import type { FC } from 'react'

import s from './style.module.css'


const getWidthStyle = (imgNum: number) => {
  if (imgNum === 1) {
    return {
      maxWidth: '100%',
    }
  }

  if (imgNum === 2 || imgNum === 4) {
    return {
      width: 'calc(50% - 4px)',
    }
  }

  return {
    width: 'calc(33.3333% - 5.3333px)',
  }
}

interface ImageGalleryProps {
  srcs: string[]
}

const ImageGallery: FC<ImageGalleryProps> = React.memo(({
  srcs,
}) => {
  const [url, setImagePreviewUrl] = useState('')

  const length = srcs.length
  const style = useMemo(() => getWidthStyle(length), [length])

  return (
    <div 
      className={clsx(
      s[`img${length}`], 
      'flex flex-wrap')} 
    >
      {
        srcs.map((src, index) => 
          !src
            ? null
            : <img
              key={index}
              className={s.item}
              style={style}
              src={src}
              alt=""
              onClick={() => setImagePreviewUrl(src)}
              onError={e => e.currentTarget.remove()}
            />
        )
      }
      {
        url && <ImagePreview
          url={url}
          onCancel={() => setImagePreviewUrl('')}
          title=""
        />
      }
    </div>
  )
})

export default ImageGallery
